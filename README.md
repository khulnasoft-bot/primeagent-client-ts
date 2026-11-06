# JavaScript client for the Primeagent API

[![NPM Version](https://img.shields.io/npm/v/%40khulnasoft%2Fprimeagent-client?logo=npm&color=%23ea2039)](https://www.npmjs.com/@khulnasoft/primeagent-client) [![Tests](https://github.com/khulnasoft-bot/primeagent-client-ts/actions/workflows/test.yml/badge.svg)](https://github.com/khulnasoft-bot/primeagent-client-ts/actions/workflows/test.yml)

---

This package provides an easy way to use the [Primeagent API](https://docs.khulnasoft.com/en/primeagent/api.html) to run flows from within server-side JavaScript applications.

- [Installation](#installation)
  - [With npm](#with-npm)
  - [With yarn](#with-yarn)
  - [With pnpm](#with-pnpm)
- [Prerequisites](#prerequisites)
- [Configuration](#configuration)
  - [KhulnaSoft Primeagent](#khulnasoft-primeagent)
  - [Open-source Primeagent](#open-source-primeagent)
- [Usage](#usage)
  - [Initialization](#initialization)
  - [Running a flow](#running-a-flow)
    - [Flow reponses](#flow-reponses)
  - [Streaming](#streaming)
  - [File upload](#file-upload)
    - [Images](#images)
    - [File uploads](#file-uploads)
  - [Logs](#logs)
    - [Fetching the logs](#fetching-the-logs)
    - [Streaming the logs](#streaming-the-logs)
  - [Aborting requests](#aborting-requests)
- [Contributing](#contributing)

## Installation

### With npm

```sh
npm install @khulnasoft/primeagent-client
```

### With yarn

```sh
yarn add @khulnasoft/primeagent-client
```

### With pnpm

```sh
pnpm add @khulnasoft/primeagent-client
```

## Prerequisites

To use this Primeagent client you will need a KhulnaSoft account with which you can use [KhulnaSoft Primeagent](https://docs.khulnasoft.com/en/primeagent/index.html). You will need a flow before you can call its API. If you don't already have one, you can get started with the [Basic Prompting Flow](https://docs.khulnasoft.com/en/primeagent/quickstart.html).

You can also use this with an installation of [open-source Primeagent](https://www.prime.khulnasoft.com/).

## Configuration

### KhulnaSoft Primeagent

You will need a [Primeagent API key](https://docs.khulnasoft.com/en/primeagent/concepts/settings.html#primeagent-api). You provide the API key when you create a new client. You will also need your Primeagent ID.

You can generate API keys and find your Primeagent ID on the API modal in the Primeagent flow editor.

### Open-source Primeagent

You will need an installation of Primeagent. You may also require an [API key](https://prime.khulnasoft.com/docs/configuration-api-keys) if you have set up [authentication on Primeagent](https://prime.khulnasoft.com/docs/configuration-authentication).

## Usage

You can import the client like so:

```js
import { PrimeagentClient } from "@khulnasoft/primeagent-client";
```

### Initialization

You can then create a new client object with the following options:

- `baseURL`: This is set to `https://api.primeagent.astra.datastax.com` by default, if you are running your own instance of Primeagent you will need to provide the URL
- `primeagentId`: The ID of your organisation, which can be found in the API modal of the flow editor. This is not required for your own instance of Primeagent
- `apiKey`: A Primeagent API key that can be generated within your KhulnaSoft account or in the settings of open-source Primeagent

```js
// using KhulnaSoft Primeagent, you do not need to provide the baseUrl
const dsPrimeagentClient = new PrimeagentClient({ primeagentId, apiKey });

// for open-source primeagent, you will need to provide a baseUrl and optionally an apiKey
const baseUrl = "http://localhost:7860";
const apiKey = "sk-...";
const osPrimeagentClient = new PrimeagentClient({ baseUrl, apiKey });
```

### Running a flow

[Primeagent documentation for running a flow](https://prime.khulnasoft.com/docs/api/simplified-run-flow).

Once you have a client, you can create a reference to a flow using the `flowID`. This can be found in the API modal in Primeagent.

```js
const flow = client.flow(flowId);
```

You can run a flow by calling `run` with the text input to the flow:

```js
const response = await client.flow(flowId).run(input);
```

You can add [tweaks](https://prime.khulnasoft.com/docs/concepts-api#tweaks) to a flow like so:

```js
const response = await client
  .flow(flowId)
  .tweak(tweakName, tweakOptions)
  .run(input);
```

Or you can pass all tweaks as an object:

```js
const response = await client.flow(flowId).run(input, { tweaks });
```

You can also pass input and output options, as well as a session ID.

```js
import { InputTypes, OutputTypes } from "@khulnasoft/primeagent-client/consts";

const response = await client.flow(flowId).run(input, {
  input_type: InputTypes.CHAT,
  output_type: OutputTypes.CHAT,
  session_id,
  tweaks,
});
```

The available input types are "chat", "text" and "any". The available output types are "chat", "text", "any" and "debug". The default for both is "chat".

#### Flow reponses

Primeagent is very flexible in its output. So the `FlowResponse` object gives you raw access to the `sessionId` and the `outputs`.

```js
const response = await client.flow(flowId).run(input);
console.log(response.outputs);
```

There is one convenience function that will return you the first chat output message text. If you only have one chat output component in your flow, this is a useful shortcut to get to that response.

```js
const response = await client.flow(flowId).run(input);
console.log(response.chatOutputText());
```

### Streaming

The Primeagent API supports streaming responses. Instead of calling `run` on a `Flow` object, you can call `stream` with the same arguments and the response will be a [`ReadableStream`](https://developer.mozilla.org/en-US/docs/Web/API/ReadableStream) of objects.

```js
const response = await client.flow(flowId).stream(input);

for await (const event of response) {
  console.log(event);
}
```

There are three different events: `add_message`, `token`, and `end`. The events mean:

- `add_message`: a message being added to the chat and can refer to a human input message or a response from an AI
- `token`: a token that is emitted as part of a message being generated by the flow
- `end`: all tokens have been returned, this message will also contain a full `FlowResponse`

Event objects have the format:

```typescript
{
  event: "add_message" | "token" | "end",
  data: object
}
```

The `event.data` is different per event type. The `token` event type is the simplest and looks like this:

```typescript
{
  "event": "token",
  "data": {
    "chunk": "hello ",
    "id": "6686ff20-0c95-40bb-8879-fd90ed3d634e",
    "timestamp": "2025-02-12 22:18:04 UTC"
  }
}
```

There's more [documentation and examples of a streaming response in the Primeagent docs](https://prime.khulnasoft.com/docs/api-reference-api-examples#run-flow).

### File upload

#### Images

The [Primeagent v1 file upload API](https://prime.khulnasoft.com/docs/api-files#filesv1-endpoints) supports uploading image files to a flow, that can then be used in that flow.

Chat input components support files as input as well as text. You need to upload your file first, using the file upload function, then provide the file path to the flow as a tweak.

```js
const buffer = await readFile(path);
const file = new File([buffer], "image.jpg", { type: "image/jpeg" });

const flow = client.flow(flowId)
const file = await flow.uploadFile(file);
console.log(file);
// => { flowId: "XXX", filePath: "YYY" }

const response = await flow
  .tweak("ChatInput-abcd": { files: file.filePath })
  .run("What can you see in this image?");
```

> [!WARNING]  
> KhulnaSoft Primeagent doesn't make file upload available, you will receive a 501 Not Implemented error.

#### File uploads

The [Primeagent v2 file upload API](https://prime.khulnasoft.com/docs/api-files#filesv2-endpoints) supports uploading files to a user. These can then be used with the [File component](https://prime.khulnasoft.com/docs/components-data#file).

> [!WARNING]
> The v2 file upload and the File component don't support image uploads. For images you should use the [v1 file upload API](#images).

You can upload files like this:

```js
const buffer = await readFile(path);
const file = new File([buffer], "document.pdf", { type: "application/pdf" });

const fileUpload = await client.files.upload(file);
console.log(file);
// => { path: "abc123/document.pdf", name: "document", ... }
```

You can then send them to the file component in a flow using a tweak.

```js
const flow = client.flow(flowId);
flow.tweak("File-abc123", {
  path: fileUpload.path,
});
```

You can also list your uploaded files with the `files.list()` function:

```js
const files = await client.files.list();

console.log(files);
// [{ path: "...", }, ...]
```

> [!NOTE]
> TODO: other file methods available through the API: download, edit, delete, and delete all

### Logs

[Primeagent documentation for the logs API](https://prime.khulnasoft.com/docs/api/logs).

#### Fetching the logs

You can fetch the logs for the your Primeagent instance.

```js
const logs = await client.logs.fetch();
```

When fetching the logs, you can pass a `timestamp` and either a number of `lines_before` or `lines_after` the timestamp. For example, the following code will get the 10 log lines that happened after 1 hour ago:

```js
const logs = await client.logs.fetch({
  timestamp: Date.now() - 60 * 60 * 1000,
  lines_after: 10,
});
```

#### Streaming the logs

You can also stream the logs by requesting the [streaming endpoint](https://prime.khulnasoft.com/docs/api/stream-logs).

```js
for await (const log of await client.logs.stream()) {
  console.log(log);
}
```

### Aborting requests

You can use the standard [`AbortController`](https://developer.mozilla.org/en-US/docs/Web/API/AbortController) to cancel requests by passing a `signal` to the `run` or `uploadFile` functions. The functions will reject with a `DOMException` error with the name `AbortError` or, if you use [`AbortSignal.timeout`](https://developer.mozilla.org/en-US/docs/Web/API/AbortSignal/timeout_static), `TimeoutError`.

For example, when running the following code, if the entire request takes longer than 500ms, then the promise will reject and the error message will be, "The operation was aborted due to timeout".

```js
const signal = AbortSignal.timeout(500);
try {
  const response = await client.flow(flowId).run(input, { signal });
} catch (error) {
  console.error(error.message);
}
```

## Contributing

To run and contribute to this library you can clone the repository:

```sh
git clone git@github.com:khulnasoft/primeagent-client-ts.git
cd primeagent-client-ts
```

Install the dependencies:

```sh
npm install
```

Run the tests:

```sh
npm test
```

Transpile the TypeScript to JavaScript:

```sh
npm run build
```

Transpile the TypeScript to JavaScript in watch mode:

```sh
npm run build:watch
```

Lint the code:

```sh
npm run lint
```

Format the code:

```sh
npm run format
```

Check the formatting of the code:

```sh
npm run format:check
```
