# coRPC: Cross-Origin Remote Procedure Call

<a href="https://pkg-size.dev/corpc"><img src="https://pkg-size.dev/badge/install/33881" title="Install size for corpc"></a> <a href="https://pkg-size.dev/corpc"><img src="https://pkg-size.dev/badge/bundle/1554" title="Bundle size for corpc"></a>

A package for promisifying cross-origin messaging (e.g. `window.postMessage`).

## Install

```sh
npm install corpc
```

## Usage

```ts
createCorpc({
  procedures,
  postMessage,
  listener,
  addMessageEventListener,
  removeMessageEventListener,
  timeout,
  logger,
}): {
  createProxy,
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

| Property      | Type                                                                                | Description                                      |
| ------------- | ----------------------------------------------------------------------------------- | ------------------------------------------------ |
| `createProxy` | `<RemoteProcedures extends Procedures>() => RemoteProcedureProxy<RemoteProcedures>` | Creates the proxy for calling remote procedures. |
| `cleanUp`     | `() => void`                                                                        | Remove message event listener.                   |

## Examples

### iFrame example

```ts
// Parent

import { createCorpc } from "corpc";
import type { IFrameProcedures } from "./iframe";

const iframe: HTMLIFrameElement = new HTMLIFrameElement();

const parentProcedures = createCorpc({
  procedures: {
    getDataFromParent: (id: string) => {
      return "parent data";
    },
  },
  postMessage: (message) => iframe.contentWindow?.postMessage(message, "*"),
});

const iframeProcedureProxy = parentProcedures.createProxy<IFrameProcedures>();

const result = await iframeProcedureProxy.getDataFromIFrame(10);
// ^? const result: string

export type ParentProcedures = typeof parentProcedures;

// iFrame

import { createCorpc } from "corpc";
import type { ParentProcedures } from "./parent";

const iframeProcedures = createCorpc({
  procedures: {
    getDataFromIFrame: (id: number) => {
      return "iframe data";
    },
  },
  postMessage: (message: any) => window.top?.postMessage(message, "*"),
});

const parentProcedureProxy = iframeProcedures.createProxy<ParentProcedures>();

const result = await parentProcedureProxy.getDataFromParent("10");
// ^? const result: string

export type IFrameProcedures = typeof iframeEvents;
```

### Figma plugin example

```ts
// Main Process

import { createCorpc } from "corpc";
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

const mainProcedures = createCorpc({
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

const uiProcedureProxy = mainProcedures.createProxy<UiProcedures>();

export type MainProcedures = typeof mainProcedures;

// UI Process

import { createCorpc } from "corpc";
import type { MainProcedures } from "./main";

const uiProcedures = createCorpc({
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

export const mainProcedureProxy = uiProcedures.createProxy<MainProcedures>();

export type UiProcedures = typeof uiProcedures;

const user = await mainProcedureProxy.getCurrentUser();
// ^? const user: User | null
```
