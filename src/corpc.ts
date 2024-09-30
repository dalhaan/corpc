import { extractError } from "./utils/extractError.js";

const DEFAULT_EVENT_TIMEOUT = 5000;

export type Events = Record<string, (...args: any) => any>;

type Config<Listener extends (...args: any) => void> = {
  events?: Events;
  postMessage?: (message: unknown) => void;
  listener?: (handler: (message: unknown) => void) => Listener;
  addMessageEventListener?: (listener: Listener) => void;
  removeMessageEventListener?: (listener: Listener) => void;
  timeout?: number;
  logger?: (...args: any) => void;
};

type EventHandlers<E extends Events> = {
  [EventName in keyof Omit<E, "createProxy">]: (
    ...args: Parameters<E[EventName]>
  ) => ReturnType<E[EventName]> extends Promise<unknown>
    ? ReturnType<E[EventName]>
    : Promise<ReturnType<E[EventName]>>;
};

export function createCorpc<
  Listener extends (...args: any) => void,
  Cfg extends Config<Listener>,
>(
  config: Config<Listener> & Cfg,
): Cfg["events"] & {
  createProxy<E extends Events>(): EventHandlers<E>;
  cleanUp: () => void;
} {
  const postMessageHandler =
    config.postMessage ||
    ((message: unknown) => {
      window.parent.postMessage(message, "*");
    });
  const listenerHandler =
    config.listener ||
    ((handler) => (event: MessageEvent) => {
      handler(event.data);
    });
  const addMessageEventListenerHandler = (config.addMessageEventListener ||
    ((listener: (event: MessageEvent) => void) => {
      window.addEventListener("message", listener);
    })) as (listener: Listener | ((event: MessageEvent) => void)) => void;
  const removeMessageEventListenerHandler =
    (config.removeMessageEventListener ||
      ((listener: (event: MessageEvent) => void) => {
        window.removeEventListener("message", listener);
      })) as (listener: Listener | ((event: MessageEvent) => void)) => void;

  function createProxy<E extends Events>() {
    let currentId = 0;

    return new Proxy(
      {},
      {
        get(target, prop, _receiver) {
          const eventName = prop as keyof typeof target;

          const eventId = currentId++;

          return (...args: Parameters<(typeof target)[keyof typeof target]>) =>
            new Promise((resolve, reject) => {
              const listener = listenerHandler(onMessage);

              const timeoutHandle = setTimeout(() => {
                reject(new Error("Event handler timed out."));
                removeMessageEventListenerHandler(listener);
              }, config.timeout ?? DEFAULT_EVENT_TIMEOUT);

              function onMessage(message: unknown) {
                if (typeof message === "undefined") {
                  return;
                }

                if (!Array.isArray(message)) {
                  return;
                }

                const [name, resultEventId, wasSuccessful, result] = message;

                if (typeof name !== "string") {
                  return;
                }

                if (
                  typeof resultEventId !== "number" ||
                  resultEventId !== eventId
                ) {
                  return;
                }

                if (typeof wasSuccessful !== "boolean") {
                  return;
                }

                if (
                  name === `result:${eventName}` &&
                  resultEventId === eventId
                ) {
                  clearTimeout(timeoutHandle);

                  if (wasSuccessful) {
                    resolve(result);
                    config.logger?.("EVENT::SUCCESS", eventId, eventName);
                  } else {
                    reject(result);
                    config.logger?.("EVENT::FAIL", eventId, eventName);
                  }
                }

                removeMessageEventListenerHandler(listener);
              }

              addMessageEventListenerHandler(listener);

              postMessageHandler([eventName, eventId, ...args]);

              config.logger?.("EVENT::EMIT", eventId, eventName);
            });
        },
      },
    ) as EventHandlers<E>;
  }

  function handleMessage(message: unknown) {
    if (!config.events) {
      return;
    }

    if (!Array.isArray(message)) {
      return;
    }

    const [name, eventId, ...rest]: Array<unknown> = message;
    if (typeof name !== "string") {
      return;
    }
    if (typeof eventId !== "number") {
      return;
    }

    for (const eventName of Object.keys(config.events)) {
      if (eventName === name) {
        try {
          const handler =
            config.events[eventName as keyof typeof config.events];

          if (!handler) {
            throw new Error("Handler has not been defined");
          }

          config.logger?.("EVENT::HANDLE", eventId, eventName);

          const result = handler(...rest);

          if (result instanceof Promise) {
            result
              .then((value) => {
                postMessageHandler([
                  `result:${eventName}`,
                  eventId,
                  true,
                  value,
                ]);
              })
              .catch((error) => {
                postMessageHandler([
                  `result:${eventName}`,
                  eventId,
                  false,
                  extractError(error),
                ]);
              });
          } else {
            postMessageHandler([`result:${eventName}`, eventId, true, result]);
          }
        } catch (error) {
          postMessageHandler([
            `result:${eventName}`,
            eventId,
            false,
            extractError(error),
          ]);
        }
      }
    }
  }

  const messageListener = listenerHandler(handleMessage);

  function cleanUp() {
    if (config.events) {
      removeMessageEventListenerHandler(messageListener);
    }
  }

  if (config.events) {
    addMessageEventListenerHandler(messageListener);
  }

  return {
    createProxy,
    cleanUp,
    ...config.events,
  };
}
