import { extractError } from "./utils/extractError.js";

const DEFAULT_EVENT_TIMEOUT = 5000;

export type Procedures = Record<string, (...args: any) => any>;

type Config<Listener extends (...args: any) => void> = {
  procedures?: Procedures;
  postMessage?: (message: unknown) => void;
  listener?: (handler: (message: unknown) => void) => Listener;
  addMessageEventListener?: (listener: Listener) => void;
  removeMessageEventListener?: (listener: Listener) => void;
  timeout?: number;
  logger?: (...args: any) => void;
};

type RemoteProcedureProxy<RemoteProcedures extends Procedures> = {
  [EventName in keyof Omit<RemoteProcedures, "createProxy">]: (
    ...args: Parameters<RemoteProcedures[EventName]>
  ) => ReturnType<RemoteProcedures[EventName]> extends Promise<unknown>
    ? ReturnType<RemoteProcedures[EventName]>
    : Promise<ReturnType<RemoteProcedures[EventName]>>;
};

export function createCorpc<
  Listener extends (...args: any) => void,
  Cfg extends Config<Listener>,
>(
  config: Config<Listener> & Cfg,
): Cfg["procedures"] & {
  createProxy<
    RemoteProcedures extends Procedures,
  >(): RemoteProcedureProxy<RemoteProcedures>;
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

  function createProxy<RemoteProcedures extends Procedures>() {
    let currentId = 0;

    return new Proxy(
      {},
      {
        get(target, prop, _receiver) {
          const eventName = prop as keyof typeof target;

          const procedureId = currentId++;

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

                const [name, resultProcedureId, wasSuccessful, result] =
                  message;

                if (typeof name !== "string") {
                  return;
                }

                if (
                  typeof resultProcedureId !== "number" ||
                  resultProcedureId !== procedureId
                ) {
                  return;
                }

                if (typeof wasSuccessful !== "boolean") {
                  return;
                }

                if (
                  name === `result:${eventName}` &&
                  resultProcedureId === procedureId
                ) {
                  clearTimeout(timeoutHandle);

                  if (wasSuccessful) {
                    resolve(result);
                    config.logger?.(
                      "PROCEDURE::SUCCESS",
                      procedureId,
                      eventName,
                    );
                  } else {
                    reject(result);
                    config.logger?.("PROCEDURE::FAIL", procedureId, eventName);
                  }
                }

                removeMessageEventListenerHandler(listener);
              }

              addMessageEventListenerHandler(listener);

              postMessageHandler([eventName, procedureId, ...args]);

              config.logger?.("PROCEDURE::EMIT", procedureId, eventName);
            });
        },
      },
    ) as RemoteProcedureProxy<RemoteProcedures>;
  }

  function handleMessage(message: unknown) {
    if (!config.procedures) {
      return;
    }

    if (!Array.isArray(message)) {
      return;
    }

    const [name, procedureId, ...rest]: Array<unknown> = message;
    if (typeof name !== "string") {
      return;
    }
    if (typeof procedureId !== "number") {
      return;
    }

    for (const procedureName of Object.keys(config.procedures)) {
      if (procedureName === name) {
        try {
          const handler =
            config.procedures[procedureName as keyof typeof config.procedures];

          if (!handler) {
            throw new Error("Handler has not been defined");
          }

          config.logger?.("PROCEDURE::HANDLE", procedureId, procedureName);

          const result = handler(...rest);

          if (result instanceof Promise) {
            result
              .then((value) => {
                postMessageHandler([
                  `result:${procedureName}`,
                  procedureId,
                  true,
                  value,
                ]);
              })
              .catch((error) => {
                postMessageHandler([
                  `result:${procedureName}`,
                  procedureId,
                  false,
                  extractError(error),
                ]);
              });
          } else {
            postMessageHandler([
              `result:${procedureName}`,
              procedureId,
              true,
              result,
            ]);
          }
        } catch (error) {
          postMessageHandler([
            `result:${procedureName}`,
            procedureId,
            false,
            extractError(error),
          ]);
        }
      }
    }
  }

  const messageListener = listenerHandler(handleMessage);

  function cleanUp() {
    if (config.procedures) {
      removeMessageEventListenerHandler(messageListener);
    }
  }

  if (config.procedures) {
    addMessageEventListenerHandler(messageListener);
  }

  return {
    createProxy,
    cleanUp,
    ...config.procedures,
  };
}
