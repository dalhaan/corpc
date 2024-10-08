# coRPC: Cross-Origin Remote Procedure Call

<a href="https://pkg-size.dev/corpc"><img src="https://pkg-size.dev/badge/install/39211" title="Install size for corpc"></a> <a href="https://pkg-size.dev/corpc"><img src="https://pkg-size.dev/badge/bundle/1374" title="Bundle size for corpc"></a>

A package for promisifying cross-origin messaging (e.g. `window.postMessage`).

## Install

```sh
npm install corpc
```

```sh
yarn add corpc
```

```sh
pnpm add corpc
```

## Usage

```ts
import { defineProcedures } from "corpc";
import type { RemoteProcedures } from "./remote-procedures";

const localProcedures = defineProcedures({
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

export type LocalProcedures = typeof localProcedures;

const remoteRPC = procedures.createRPC<RemoteProcedures>();
```

**Parameter:**

| Property                     | Type                                                     | Default                                                                                             | Description                                                                                                                                                                   |
| ---------------------------- | -------------------------------------------------------- | --------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `procedures`                 | `{ [procedureName: string]: (...args: unknown) => any }` | `undefined`                                                                                         | The local functions to be called remotely.                                                                                                                                    |
| `postMessage`                | `(message: unknown) => void`                             | `(message: unknown) => { window.parent.postMessage(message, "*"); }`                                | Define the function that sends messages to the other origin.<br><br> `message` is what is sent by coRPC and needs to be received by the other origin via the `listener` prop. |
| `listener`                   | `(handler: (message: unknown) => void) => Listener`      | `(handler) => (event: MessageEvent) => { handler(event.data); }`                                    | Define the listener handler. This is used in `addMessageEventListener` and `removeMessageEventListener`.<br><br>`handler` expects the `message` argument from `postMessage`.  |
| `addMessageEventListener`    | `(listener: Listener) => void`                           | `(listener: (event: MessageEvent) => void) => { window.addEventListener("message", listener); }`    | The local "add message event listener" implementation.                                                                                                                        |
| `removeMessageEventListener` | `(listener: Listener) => void`                           | `(listener: (event: MessageEvent) => void) => { window.removeEventListener("message", listener); }` | The local "remove message event listener" implementation.                                                                                                                     |
| `timeout`                    | `number`                                                 | `5000`                                                                                              | RPC timeout. Function will throw if it takes longer than the timeout.                                                                                                         |
| `logger`                     | `(...args: any) => void`                                 | `undefined`                                                                                         | Log function for debug logging.                                                                                                                                               |

**Returns:**

| Property    | Type                                                                                | Description                                      |
| ----------- | ----------------------------------------------------------------------------------- | ------------------------------------------------ |
| `createRPC` | `<RemoteProcedures extends Procedures>() => RemoteProcedureProxy<RemoteProcedures>` | Creates the proxy for calling remote procedures. |
| `cleanUp`   | `() => void`                                                                        | Remove message event listener.                   |

## Examples

### iFrame example

```ts
// parent.ts

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

export type ParentProcedures = typeof parentProcedures;

const iframeRPC = parentProcedures.createRPC<IFrameProcedures>();
/**
 * ^? const iframeRPC: {
 *      getDataFromIFrame: (id: number) => Promise<string>;
 *    }
 */

const result = await iframeRPC.getDataFromIFrame(10);
// ^? const result: string
```

```ts
// iframe.ts

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

export type IFrameProcedures = typeof iframeEvents;

const parentRPC = iframeProcedures.createRPC<ParentProcedures>();
/**
 * ^? const parentRPC: {
 *      getDataFromParent: (id: string) => Promise<string>;
 *    }
 */

const result = await parentRPC.getDataFromParent("10");
// ^? const result: string
```

### Figma plugin example

```ts
// main.ts

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

export type MainProcedures = typeof mainProcedures;

const uiRPC = mainProcedures.createRPC<UiProcedures>();
/**
 * ^? const uiRPC: {}
 */
```

```ts
// ui.ts

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

export type UiProcedures = typeof uiProcedures;

export const mainRPC = uiProcedures.createRPC<MainProcedures>();
/**
 * ^? const mainRPC: {
 *      getCurrentUser: () => Promise<User | null>;
 *      getState: (key: string) => Promise<unknown>;
 *      updateState: (key: string, value: any) => Promise<void>;
 *      close: () => Promise<void>;
 *    }
 */

const user = await mainRPC.getCurrentUser();
// ^? const user: User | null
```
