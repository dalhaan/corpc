import { defineProcedures, type Procedures } from "./corpc.js";
import { test, expect, describe } from "vitest";

type Handler = (message: any) => void;

const localWindow = {
  listeners: new Set<Handler>(),
  postMessage(message: any) {
    remoteWindow.onMessage(message);
  },
  addListener(handler: Handler) {
    this.listeners.add(handler);
  },
  removeListener(handler: Handler) {
    this.listeners.delete(handler);
  },
  onMessage(message: any) {
    for (const listener of this.listeners) {
      listener(message);
    }
  },
};

const remoteWindow = {
  listeners: new Set<Handler>(),
  postMessage(message: any) {
    localWindow.onMessage(message);
  },
  addListener(handler: Handler) {
    this.listeners.add(handler);
  },
  removeListener(handler: Handler) {
    this.listeners.delete(handler);
  },
  onMessage(message: any) {
    for (const listener of this.listeners) {
      listener(message);
    }
  },
};

function rpcFactoryLocal<E extends Procedures>({
  procedures,
  timeout,
}: {
  procedures?: E;
  timeout?: number;
}) {
  const localProcedures = defineProcedures({
    procedures,
    postMessage(message) {
      localWindow.postMessage(message);
    },
    listener: (handler) => (message: any) => {
      handler(message);
    },
    addMessageEventListener(listener) {
      localWindow.addListener(listener);
    },
    removeMessageEventListener(listener) {
      localWindow.removeListener(listener);
    },
    timeout,
    logger: (...args) => console.log("Local", ...args),
  });

  return localProcedures;
}

function rpcFactoryRemote<E extends Procedures>({
  procedures,
  timeout,
}: {
  procedures?: E;
  timeout?: number;
}) {
  const remoteProcedures = defineProcedures({
    procedures,
    postMessage(message) {
      remoteWindow.postMessage(message);
    },
    listener: (handler) => (message: any) => {
      handler(message);
    },
    addMessageEventListener(listener) {
      remoteWindow.addListener(listener);
    },
    removeMessageEventListener(listener) {
      remoteWindow.removeListener(listener);
    },
    timeout,
    logger: (...args) => console.log("Remote", ...args),
  });

  return remoteProcedures;
}

describe("sync", () => {
  test("success", async () => {
    const localProcedures = rpcFactoryLocal({
      procedures: {
        test: () => "A TEST",
      },
    });

    const remoteProcedures = rpcFactoryRemote({
      procedures: {
        test: () => "B TEST",
      },
    });

    const localRPC = remoteProcedures.createRPC<typeof localProcedures>();
    const remoteRPC = localProcedures.createRPC<typeof remoteProcedures>();

    const aTest = await localRPC.test();
    const bTest = await remoteRPC.test();

    expect(aTest).toBe("A TEST");
    expect(bTest).toBe("B TEST");

    localProcedures.cleanUp();
    remoteProcedures.cleanUp();
  });

  test("fail", async () => {
    const localProcedures = rpcFactoryLocal({
      procedures: {
        test: () => {
          throw new Error("Simulated fail");
        },
      },
    });

    const remoteProcedures = rpcFactoryRemote({
      procedures: {
        test: () => {
          throw new Error("Simulated fail");
        },
      },
    });

    const localRPC = remoteProcedures.createRPC<typeof localProcedures>();
    const remoteRPC = localProcedures.createRPC<typeof remoteProcedures>();

    await expect(() => localRPC.test()).rejects.toThrowError(/Simulated fail/);
    await expect(() => remoteRPC.test()).rejects.toThrowError(/Simulated fail/);

    localProcedures.cleanUp();
    remoteProcedures.cleanUp();
  });

  test("many events", async () => {
    const localProcedures = rpcFactoryLocal({
      procedures: {
        test: () => "A TEST",
        testB: () => "A TEST B",
        testC: () => "A TEST C",
        testD: () => "A TEST D",
      },
    });

    const remoteProcedures = rpcFactoryRemote({
      procedures: {
        test: () => "B TEST",
        testB: () => "B TEST B",
        testC: () => "B TEST C",
        testD: () => "B TEST D",
      },
    });

    const localRPC = remoteProcedures.createRPC<typeof localProcedures>();
    const remoteRPC = localProcedures.createRPC<typeof remoteProcedures>();

    expect(await localRPC.test()).toBe("A TEST");
    expect(await localRPC.testB()).toBe("A TEST B");
    expect(await localRPC.testC()).toBe("A TEST C");
    expect(await localRPC.testD()).toBe("A TEST D");

    expect(await remoteRPC.test()).toBe("B TEST");
    expect(await remoteRPC.testB()).toBe("B TEST B");
    expect(await remoteRPC.testC()).toBe("B TEST C");
    expect(await remoteRPC.testD()).toBe("B TEST D");

    localProcedures.cleanUp();
    remoteProcedures.cleanUp();
  });

  test("undefined RPC", async () => {
    const localProcedures = rpcFactoryLocal({
      procedures: {
        a: () => "local:a",
        b: () => "local:b",
      },
      timeout: 500,
    });

    const remoteProcedures = rpcFactoryRemote({
      procedures: {
        a: () => "remote:a",
        b: () => "remote:b",
      },
      timeout: 500,
    });

    const localRPC = remoteProcedures.createRPC<typeof localProcedures>();
    const remoteRPC = localProcedures.createRPC<typeof remoteProcedures>();

    // @ts-expect-error we are intentionally calling an RPC that doesn't exist on the remote
    await expect(() => localRPC.c()).rejects.toThrowError(/timed out/);
    // @ts-expect-error we are intentionally calling an RPC that doesn't exist on the remote
    await expect(() => remoteRPC.c()).rejects.toThrowError(/timed out/);

    localProcedures.cleanUp();
    remoteProcedures.cleanUp();
  });
});

describe("async", () => {
  test("success", async () => {
    const localProcedures = rpcFactoryLocal({
      procedures: {
        longAwaited: () =>
          new Promise<string>((resolve) => {
            setTimeout(() => {
              resolve("A longAwaited");
            }, 1000);
          }),
      },
    });

    const remoteProcedures = rpcFactoryRemote({
      procedures: {
        longAwaited: () =>
          new Promise<string>((resolve) => {
            setTimeout(() => {
              resolve("B longAwaited");
            }, 1000);
          }),
      },
    });

    const localRPC = remoteProcedures.createRPC<typeof localProcedures>();
    const remoteRPC = localProcedures.createRPC<typeof remoteProcedures>();

    const localLongAwaited = await localRPC.longAwaited();
    const remoteLongAwaited = await remoteRPC.longAwaited();

    expect(localLongAwaited).toBe("A longAwaited");
    expect(remoteLongAwaited).toBe("B longAwaited");

    localProcedures.cleanUp();
    remoteProcedures.cleanUp();
  });

  test("fail", async () => {
    const localProcedures = rpcFactoryLocal({
      procedures: {
        longAwaited: () =>
          new Promise<string>((_resolve, reject) => {
            setTimeout(() => {
              reject("Simulated fail");
            }, 1000);
          }),
      },
    });

    const remoteProcedures = rpcFactoryRemote({
      procedures: {
        longAwaited: () =>
          new Promise<string>((_resolve, reject) => {
            setTimeout(() => {
              reject("Simulated fail");
            }, 1000);
          }),
      },
    });

    const localRPC = remoteProcedures.createRPC<typeof localProcedures>();
    const remoteRPC = localProcedures.createRPC<typeof remoteProcedures>();

    await expect(() => localRPC.longAwaited()).rejects.toThrowError(
      /Simulated fail/,
    );
    await expect(() => remoteRPC.longAwaited()).rejects.toThrowError(
      /Simulated fail/,
    );

    localProcedures.cleanUp();
    remoteProcedures.cleanUp();
  });

  test("timeout", async () => {
    const localProcedures = rpcFactoryLocal({
      procedures: {
        longAwaited: () =>
          new Promise<string>((resolve) => {
            setTimeout(() => {
              resolve("A longAwaited");
            }, 1000);
          }),
      },
      timeout: 500,
    });

    const remoteProcedures = rpcFactoryRemote({
      procedures: {
        longAwaited: () =>
          new Promise<string>((resolve) => {
            setTimeout(() => {
              resolve("B longAwaited");
            }, 1000);
          }),
      },
      timeout: 500,
    });

    const localRPC = remoteProcedures.createRPC<typeof localProcedures>();
    const remoteRPC = localProcedures.createRPC<typeof remoteProcedures>();

    await expect(() => localRPC.longAwaited()).rejects.toThrowError(
      /timed out/,
    );
    await expect(() => remoteRPC.longAwaited()).rejects.toThrowError(
      /timed out/,
    );

    localProcedures.cleanUp();
    remoteProcedures.cleanUp();
  });
});
