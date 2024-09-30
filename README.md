# coRPC: Cross-Origin Remote Procedure Call

A package for promisifying cross-origin messaging (e.g. `window.postMessage`).

## Install

```sh
npm install corpc
```

## Basic usage

```ts
// Window A

import { createCorpc } from "corpc";
import type { WindowBEvents } from "Window B";

const events = createCorpc({
  events: {
    getTitle: () => document.title,
  },
});

export const windowBEvents = events.createProxy<WindowBEvents>();
//           ^ `{ getTitle: () => Promise<string> }`

export type WindowAEvents = typeof events;

// Window B

import { createCorpc } from "corpc";
import type { WindowAEvents } from "Window A";

const events = createCorpc({
  events: {
    getTitle: () => document.title,
  },
});

export const windowAEvents = events.createProxy<WindowAEvents>();
//           ^ `{ getTitle: () => Promise<string> }`

export type WindowBEvents = typeof events;
```
