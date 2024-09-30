import { createCorpc, type Events } from "./corpc.js";
import { test, expect, describe } from "vitest";

type Handler = (message: any) => void;

const windowA = {
  listeners: new Set<Handler>(),
  postMessage(message: any) {
    windowB.onMessage(message);
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

const windowB = {
  listeners: new Set<Handler>(),
  postMessage(message: any) {
    windowA.onMessage(message);
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

function coFactoryA<E extends Events>({
  events,
  timeout,
}: {
  events?: E;
  timeout?: number;
}) {
  const eventHandlers = createCorpc({
    events: events,
    postMessage(message) {
      console.log("postMessage a -> b", message);
      windowA.postMessage(message);
    },
    listener: (handler) => (message: any) => {
      handler(message);
    },
    addMessageEventListener(listener) {
      console.log("addMessageEventListener a", listener);
      windowA.addListener(listener);
    },
    removeMessageEventListener(listener) {
      console.log("removeMessageEventListener a", listener);
      windowA.removeListener(listener);
    },
    timeout,
  });

  return eventHandlers;
}

function coFactoryB<E extends Events>({
  events,
  timeout,
}: {
  events?: E;
  timeout?: number;
}) {
  const eventHandlers = createCorpc({
    events: events,
    postMessage(message) {
      console.log("postMessage b -> a", message);
      windowB.postMessage(message);
    },
    listener: (handler) => (message: any) => {
      handler(message);
    },
    addMessageEventListener(listener) {
      console.log("addMessageEventListener b", listener);
      windowB.addListener(listener);
    },
    removeMessageEventListener(listener) {
      console.log("removeMessageEventListener b", listener);
      windowB.removeListener(listener);
    },
    timeout,
  });

  return eventHandlers;
}

describe(
  "sync",
  () => {
    test("success", async () => {
      const eventsA = coFactoryA({
        events: {
          test: () => "A TEST",
        },
      });

      const eventsB = coFactoryB({
        events: {
          test: () => "B TEST",
        },
      });

      const proxyA = eventsB.createProxy<typeof eventsA>();
      const proxyB = eventsA.createProxy<typeof eventsB>();

      const aTest = await proxyA.test();
      const bTest = await proxyB.test();

      expect(aTest).toBe("A TEST");
      expect(bTest).toBe("B TEST");

      eventsA.cleanUp();
      eventsB.cleanUp();
    });

    test("fail", async () => {
      const eventsA = coFactoryA({
        events: {
          test: () => {
            throw new Error("Simulated fail");
          },
        },
      });

      const eventsB = coFactoryB({
        events: {
          test: () => {
            throw new Error("Simulated fail");
          },
        },
      });

      const proxyA = eventsB.createProxy<typeof eventsA>();
      const proxyB = eventsA.createProxy<typeof eventsB>();

      await expect(() => proxyA.test()).rejects.toThrowError(/Simulated fail/);
      await expect(() => proxyB.test()).rejects.toThrowError(/Simulated fail/);

      eventsA.cleanUp();
      eventsB.cleanUp();
    });
  },
  {
    concurrent: false,
  },
);

describe("async", () => {
  test("success", async () => {
    const eventsA = coFactoryA({
      events: {
        longAwaited: () =>
          new Promise<string>((resolve) => {
            setTimeout(() => {
              resolve("A longAwaited");
            }, 1000);
          }),
      },
    });

    const eventsB = coFactoryB({
      events: {
        longAwaited: () =>
          new Promise<string>((resolve) => {
            setTimeout(() => {
              resolve("B longAwaited");
            }, 1000);
          }),
      },
    });

    const proxyA = eventsB.createProxy<typeof eventsA>();
    const proxyB = eventsA.createProxy<typeof eventsB>();

    const aLongAwaited = await proxyA.longAwaited();
    const bLongAwaited = await proxyB.longAwaited();

    expect(aLongAwaited).toBe("A longAwaited");
    expect(bLongAwaited).toBe("B longAwaited");

    eventsA.cleanUp();
    eventsB.cleanUp();
  });

  test("fail", async () => {
    const eventsA = coFactoryA({
      events: {
        longAwaited: () =>
          new Promise<string>((_resolve, reject) => {
            setTimeout(() => {
              reject("Simulated fail");
            }, 1000);
          }),
      },
    });

    const eventsB = coFactoryB({
      events: {
        longAwaited: () =>
          new Promise<string>((_resolve, reject) => {
            setTimeout(() => {
              reject("Simulated fail");
            }, 1000);
          }),
      },
    });

    const proxyA = eventsB.createProxy<typeof eventsA>();
    const proxyB = eventsA.createProxy<typeof eventsB>();

    await expect(() => proxyA.longAwaited()).rejects.toThrowError(
      /Simulated fail/,
    );
    await expect(() => proxyB.longAwaited()).rejects.toThrowError(
      /Simulated fail/,
    );

    eventsA.cleanUp();
    eventsB.cleanUp();
  });

  test("timeout", async () => {
    const eventsA = coFactoryA({
      events: {
        longAwaited: () =>
          new Promise<string>((resolve) => {
            setTimeout(() => {
              resolve("A longAwaited");
            }, 1000);
          }),
      },
      timeout: 500,
    });

    const eventsB = coFactoryB({
      events: {
        longAwaited: () =>
          new Promise<string>((resolve) => {
            setTimeout(() => {
              resolve("B longAwaited");
            }, 1000);
          }),
      },
      timeout: 500,
    });

    const proxyA = eventsB.createProxy<typeof eventsA>();
    const proxyB = eventsA.createProxy<typeof eventsB>();

    await expect(() => proxyA.longAwaited()).rejects.toThrowError(/timed out/);
    await expect(() => proxyB.longAwaited()).rejects.toThrowError(/timed out/);

    eventsA.cleanUp();
    eventsB.cleanUp();
  });
});
