# coRPC: Cross-Origin Remote Procedure Call

<a href="https://pkg-size.dev/corpc"><img src="https://pkg-size.dev/badge/install/33881" title="Install size for corpc"></a> <a href="https://pkg-size.dev/corpc"><img src="https://pkg-size.dev/badge/bundle/1554" title="Bundle size for corpc"></a>

A package for promisifying cross-origin messaging (e.g. `window.postMessage`).

## Install

```sh
npm install corpc
```

## Usage

```ts
defineProcedures({
  procedures,
  postMessage,
  listener,
  addMessageEventListener,
  removeMessageEventListener,
  timeout,
  logger,
}): {
  createRPC,
  cleanUp,
  ...procedures
};
```

**Parameter:**

| Property                     | Type                                                | Default                                                                                             | Description                                                           |
| ---------------------------- | --------------------------------------------------- | --------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| `procedures`                 | `Record<string, (...args: unknown) => any>`         | `undefined`                                                                                         | Local procedures to be called remotely.                               |
| `postMessage`                | `(message: unknown) => void`                        | `(message: unknown) => { window.parent.postMessage(message, "*"); }`                                | The local post message implementation.                                |
| `listener`                   | `(handler: (message: unknown) => void) => Listener` | `(handler) => (event: MessageEvent) => { handler(event.data); }`                                    | The local message event listener implementation.                      |
| `addMessageEventListener`    | `(listener: Listener) => void`                      | `(listener: (event: MessageEvent) => void) => { window.addEventListener("message", listener); }`    | The local "add message event listener" implementation.                |
| `removeMessageEventListener` | `(listener: Listener) => void`                      | `(listener: (event: MessageEvent) => void) => { window.removeEventListener("message", listener); }` | The local "remove message event listener" implementation.             |
| `timeout`                    | `number`                                            | `5000`                                                                                              | RPC timeout. Function will throw if it takes longer than the timeout. |
| `logger`                     | `(...args: any) => void`                            | `undefined`                                                                                         | Log function for debug logging.                                       |

**Returns:**

| Property    | Type                                                                                | Description                                      |
| ----------- | ----------------------------------------------------------------------------------- | ------------------------------------------------ |
| `createRPC` | `<RemoteProcedures extends Procedures>() => RemoteProcedureProxy<RemoteProcedures>` | Creates the proxy for calling remote procedures. |
| `cleanUp`   | `() => void`                                                                        | Remove message event listener.                   |

## Examples

### iFrame example

```ts
// Parent

import { defineProcedures } from "corpc";
import type { IFrameProcedures } from "./iframe";

const iframe: HTMLIFrameElement = new HTMLIFrameElement();

const parentProcedures = defineProcedures({
  procedures: {
    getDataFromParent: (id: string) => {
      return "parent data";
    },
  },
  postMessage: (message) => iframe.contentWindow?.postMessage(message, "*"),
});

const iframeRPC = parentProcedures.createRPC<IFrameProcedures>();

const result = await iframeRPC.getDataFromIFrame(10);
// ^? const result: string

export type ParentProcedures = typeof parentProcedures;

// iFrame

import { defineProcedures } from "corpc";
import type { ParentProcedures } from "./parent";

const iframeProcedures = defineProcedures({
  procedures: {
    getDataFromIFrame: (id: number) => {
      return "iframe data";
    },
  },
  postMessage: (message: any) => window.top?.postMessage(message, "*"),
});

const parentRPC = iframeProcedures.createRPC<ParentProcedures>();

const result = await parentRPC.getDataFromParent("10");
// ^? const result: string

export type IFrameProcedures = typeof iframeEvents;
```

### Figma plugin example

```ts
// Main Process

import { defineProcedures } from "corpc";
import type { UiProcedures } from "./ui";

const listeners = Set<(message: unknown) => void>();

const addFigmaEventListener = (listener: (message: unknown) => void) => {
  listeners.add(listener);
};

const removeFigmaEventListener = (listener: (message: unknown) => void) => {
  listeners.delete(listener);
};

figma.ui.onmessage = (message: unknown): void => {
  for (const listener of listeners) {
    listener(message);
  }
};

const mainProcedures = defineProcedures({
  procedures: {
    getCurrentUser: () => figma.currentUser,
    getState: (key: string) => figma.clientStorage.getAsync(key),
    updateState: (key: string, value: any) =>
      figma.clientStorage.setAsync(key, value),
    close: () => figma.ui.close(),
  },
  postMessage: (message) => {
    figma.ui.postMessage(message);
  },
  listener: (handler) => (message: unknown) => {
    handler(message);
  },
  addMessageEventListener: (listener) => {
    addFigmaEventListener(listener);
  },
  removeMessageEventListener: (listener) => {
    removeFigmaEventListener(listener);
  },
});

const uiRPC = mainProcedures.createRPC<UiProcedures>();

export type MainProcedures = typeof mainProcedures;

// UI Process

import { defineProcedures } from "corpc";
import type { MainProcedures } from "./main";

const uiProcedures = defineProcedures({
  postMessage: (message) => {
    window.parent.postMessage(
      {
        pluginMessage: message,
      },
      "*",
    );
  },
  listener: (handler) => (event: MessageEvent) => {
    handler(event.data.pluginMessage);
  },
});

export const mainRPC = uiProcedures.createRPC<MainProcedures>();

export type UiProcedures = typeof uiProcedures;

const user = await mainRPC.getCurrentUser();
// ^? const user: User | null
```
