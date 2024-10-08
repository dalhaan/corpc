import { extractError } from "./utils/extractError.js";

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

export function defineProcedures<
  Listener extends (...args: any) => void,
  Cfg extends Config<Listener>,
>({
  procedures,
  postMessage = (message) => {
    window.parent.postMessage(message, "*");
  },
  // @ts-expect-error
  listener = (handler) => (event: MessageEvent) => {
    handler(event.data);
  },
  addMessageEventListener = (listener: (event: MessageEvent) => void) => {
    window.addEventListener("message", listener);
  },
  removeMessageEventListener = (listener: (event: MessageEvent) => void) => {
    window.removeEventListener("message", listener);
  },
  timeout = 5000,
  logger,
}: Config<Listener> & Cfg): Cfg["procedures"] & {
  createRPC<
    RemoteProcedures extends Procedures,
  >(): RemoteProcedureProxy<RemoteProcedures>;
  cleanUp: () => void;
} {
  function createRPC<RemoteProcedures extends Procedures>() {
    let currentId = 0;

    return new Proxy(
      {},
      {
        get(target, prop, _receiver) {
          const eventName = prop as keyof typeof target;

          const procedureId = currentId++;

          return (...args: Parameters<(typeof target)[keyof typeof target]>) =>
            new Promise((resolve, reject) => {
              const handleProcedureResponse = listener(onProcedureResponse);

              const timeoutHandle = setTimeout(() => {
                reject(new Error("Event handler timed out."));
                removeMessageEventListener(handleProcedureResponse);
              }, timeout);

              function onProcedureResponse(message: unknown) {
                if (typeof message === "undefined") {
                  return;
                }

                if (!Array.isArray(message)) {
                  return;
                }

                const [
                  name,
                  resultProcedureId,
                  isResult,
                  wasSuccessful,
                  result,
                ] = message;

                if (typeof name !== "string") {
                  return;
                }

                if (isResult !== true) {
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

                if (name === eventName) {
                  clearTimeout(timeoutHandle);

                  if (wasSuccessful) {
                    resolve(result);
                    logger?.("PROCEDURE::SUCCESS", procedureId, eventName);
                  } else {
                    reject(result);
                    logger?.("PROCEDURE::FAIL", procedureId, eventName);
                  }
                }

                removeMessageEventListener(handleProcedureResponse);
              }

              addMessageEventListener(handleProcedureResponse);

              postMessage([eventName, procedureId, false, ...args]);

              logger?.("PROCEDURE::EMIT", procedureId, eventName);
            });
        },
      },
    ) as RemoteProcedureProxy<RemoteProcedures>;
  }

  async function handleMessage(message: unknown) {
    if (!procedures) {
      return;
    }

    if (!Array.isArray(message)) {
      return;
    }

    const [name, procedureId, isResult, ...rest]: Array<unknown> = message;

    if (typeof name !== "string") {
      return;
    }
    if (typeof procedureId !== "number") {
      return;
    }

    if (isResult !== false) {
      return;
    }

    for (const procedureName of Object.keys(procedures)) {
      if (procedureName === name) {
        try {
          const handler = procedures[procedureName as keyof typeof procedures];

          if (!handler) {
            throw new Error("Handler has not been defined");
          }

          logger?.("PROCEDURE::HANDLE", procedureId, procedureName);

          const result = handler(...rest);

          postMessage([
            procedureName,
            procedureId,
            true,
            true,
            result instanceof Promise ? await result : result,
          ]);
        } catch (error) {
          postMessage([
            procedureName,
            procedureId,
            true,
            false,
            extractError(error),
          ]);
        }
      }
    }
  }

  const messageListener = listener(handleMessage);

  function cleanUp() {
    if (procedures) {
      removeMessageEventListener(messageListener);
    }
  }

  if (procedures) {
    addMessageEventListener(messageListener);
  }

  return {
    createRPC,
    cleanUp,
    ...procedures,
  };
}
