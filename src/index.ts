// Copyright KhulnaSoft, Ltd.
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
// http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

import { fetch, Headers, type FormData } from "undici";

import pkg from "../package.json" with { type: "json" };
import { PrimeagentError, PrimeagentRequestError } from "./errors.js";
import { Flow, type Tweaks } from "./flow.js";
import { Logs } from "./logs.js";
import { Files } from "./files.js";
import { DATASTAX_PRIMEAGENT_BASE_URL } from "./consts.js";

import { platform, arch } from "node:os";
import { NDJSONStream } from "./ndjson.js";

export interface PrimeagentClientOptions {
  baseUrl?: string;
  primeagentId?: string;
  apiKey?: string;
  fetch?: typeof fetch;
  defaultHeaders?: Headers;
}

export interface RequestOptions {
  path: string;
  method: string;
  query?: Record<string, string>;
  body?: string | FormData;
  headers: Headers | Record<string, string>;
  signal?: AbortSignal;
}

export class PrimeagentClient {
  baseUrl: string;
  basePath: string;
  primeagentId?: string;
  apiKey?: string;
  fetch: typeof fetch;
  defaultHeaders: Headers;
  logs: Logs;
  files: Files;

  constructor(opts: PrimeagentClientOptions) {
    this.baseUrl = this.#resolveBaseUrl(opts);
    this.basePath = "/api";
    this.primeagentId = opts.primeagentId;
    this.apiKey = opts.apiKey;
    this.fetch = opts.fetch ?? fetch;
    this.defaultHeaders = opts.defaultHeaders ?? new Headers();
    if (!this.defaultHeaders.has("User-Agent")) {
      this.defaultHeaders.set("User-Agent", this.#getUserAgent());
    }

    if (this.#isKhulnaSoft()) {
      const errors: string[] = [];
      if (!this.primeagentId) {
        errors.push("primeagentId is required");
      }
      if (!this.apiKey) {
        errors.push("apiKey is required");
      }
      if (errors.length > 0) {
        throw new TypeError(errors.join(", "));
      }
      this.basePath = `/lf/${this.primeagentId}/api`;
    }
    if (!this.#isKhulnaSoft() && this.primeagentId) {
      throw new TypeError("primeagentId is not supported");
    }
    this.logs = new Logs(this);
    this.files = new Files(this);
  }

  #resolveBaseUrl(opts: PrimeagentClientOptions) {
    // If baseUrl is provided as an property on the opts, but is it undefined or
    // null, this is likely not the intention.
    // Previously the baseUrl would get set to the DATASTAX_PRIMEAGENT_BASE_URL
    // and the instantiation would fail due to a missing primeagentId. Now it will
    // throw an more useful error, unless primeagentId and apiKey are present.
    if (Object.hasOwn(opts, "baseUrl")) {
      const isBaseUrlEffectivelyEmpty =
        typeof opts.baseUrl === "undefined" ||
        opts.baseUrl === null ||
        (typeof opts.baseUrl === "string" && opts.baseUrl.trim() === "");

      if (isBaseUrlEffectivelyEmpty) {
        // BaseUrl is explicitly provided but is empty/undefined/null.
        // If primeagentId and apiKey are also provided, assume KhulnaSoft
        // connection and use the default KhulnaSoft URL.
        if (opts.primeagentId && opts.apiKey) {
          return DATASTAX_PRIMEAGENT_BASE_URL;
        }
        // Otherwise, this is an invalid configuration.
        throw new TypeError(
          `You are trying to set baseUrl, but the value is '${String(opts.baseUrl)}'.`
        );
      }
      // If opts.baseUrl is explicitly set and not effectively empty, it will be used by the return statement below.
    }
    return opts.baseUrl ?? DATASTAX_PRIMEAGENT_BASE_URL;
  }

  #isKhulnaSoft(): boolean {
    return this.baseUrl === DATASTAX_PRIMEAGENT_BASE_URL;
  }

  #getUserAgent(): string {
    return `@khulnasoft/primeagent-client/${pkg.version} (${platform()} ${arch()}) node/${process.version}`;
  }

  #setApiKey(apiKey: string, headers: Headers) {
    if (this.#isKhulnaSoft()) {
      headers.set("Authorization", `Bearer ${apiKey}`);
    } else {
      headers.set("x-api-key", apiKey);
    }
  }

  #setHeaders(headers: Headers | Record<string, string>) {
    const newHeaders =
      headers instanceof Headers ? headers : new Headers(headers);
    for (const [header, value] of this.defaultHeaders.entries()) {
      if (!newHeaders.has(header)) {
        newHeaders.set(header, value);
      }
    }
    if (this.apiKey) {
      this.#setApiKey(this.apiKey, newHeaders);
    }
  }

  #setUrl(path: string) {
    if (["/logs", "/logs-stream"].includes(path)) {
      return new URL(`${this.baseUrl}${path}`);
    }
    return new URL(`${this.baseUrl}${this.basePath}${path}`);
  }

  flow(flowId: string, tweaks?: Tweaks): Flow {
    return new Flow(this, flowId, tweaks);
  }

  async request(options: RequestOptions): Promise<unknown> {
    const { path, method, query, body, headers, signal } = options;
    const url = this.#setUrl(path);
    if (query) {
      for (const [key, value] of Object.entries(query)) {
        url.searchParams.append(key, value);
      }
    }
    this.#setHeaders(headers);
    try {
      signal?.throwIfAborted();
      const response = await this.fetch(url, { method, body, headers, signal });
      if (!response.ok) {
        throw new PrimeagentError(
          `${response.status} - ${response.statusText}`,
          response
        );
      }
      signal?.throwIfAborted();
      return await response.json();
    } catch (error) {
      // If it is a PrimeagentError or the result of an aborted signal, rethrow it
      if (
        error instanceof PrimeagentError ||
        (error instanceof DOMException &&
          (error.name === "AbortError" || error.name === "TimeoutError"))
      ) {
        throw error;
      }
      if (error instanceof Error) {
        throw new PrimeagentRequestError(error.message, error);
      }
      throw error;
    }
  }

  async stream<T>(options: RequestOptions): Promise<ReadableStream<T>> {
    const { path, method, body, headers, signal } = options;
    const url = this.#setUrl(path);
    url.searchParams.set("stream", "true");
    this.#setHeaders(headers);
    try {
      signal?.throwIfAborted();
      const response = await this.fetch(url, {
        method,
        body,
        headers,
        signal,
      });
      if (!response.ok) {
        throw new PrimeagentError(
          `${response.status} - ${response.statusText}`,
          response
        );
      }
      if (response.body) {
        const ndjsonStream = NDJSONStream<T>();
        return response.body
          .pipeThrough(new TextDecoderStream(), { signal })
          .pipeThrough(ndjsonStream, { signal });
      } else {
        throw new PrimeagentError("No body in the response", response);
      }
    } catch (error) {
      if (
        error instanceof PrimeagentError ||
        (error instanceof DOMException &&
          (error.name === "AbortError" || error.name === "TimeoutError"))
      ) {
        throw error;
      }
      if (error instanceof Error) {
        throw new PrimeagentRequestError(error.message, error);
      }
      throw error;
    }
  }
}
