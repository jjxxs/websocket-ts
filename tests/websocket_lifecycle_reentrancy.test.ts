import { WebSocketServer } from "ws";
import {
  ArrayQueue,
  ConstantBackoff,
  Websocket,
  WebsocketBuilder,
  WebsocketEvent,
} from "../src";
import { describe, test, expect, beforeEach, afterEach } from "vitest";

/**
 * Regression tests for close()/reconnect() calls made from inside lifecycle
 * listeners. Lifecycle events are dispatched before the handler commits its
 * next internal transition; without a re-check afterwards, a close-listener
 * calling reconnect() got a duplicate retry scheduled on top of the socket it
 * already created, and a retry-listener calling close() still got a brand-new
 * socket created after the wrapper was marked closed by the user.
 */
describe("Testsuite for lifecycle listener reentrancy", () => {
  // dedicated env var (not PORT) so this file never collides with
  // tests/websocket.test.ts when the whole suite runs in parallel
  const port: number = process.env.LIFECYCLE_REENTRANCY_PORT
    ? parseInt(process.env.LIFECYCLE_REENTRANCY_PORT)
    : 41425;
  const url = `ws://localhost:${port}`;
  const timeout = 5_000;
  const testTimeout = 10_000;

  let client: Websocket | undefined;
  let server: WebSocketServer | undefined;

  beforeEach(async () => {
    server = await startServer(port, timeout);
  }, testTimeout);

  afterEach(async () => {
    await stopClient(client, timeout);
    client = undefined;
    await stopServer(server, timeout);
    server = undefined;
  }, testTimeout);

  test(
    "A close-listener calling reconnect() creates exactly one new socket and no extra retry",
    async () => {
      let urlProviderCalls = 0;
      const urlProvider = () => {
        urlProviderCalls++;
        return url;
      };
      let retryCount = 0;
      let reconnectTriggered = false;

      await new Promise<void>((resolve) => {
        client = new WebsocketBuilder(urlProvider)
          .withBackoff(new ConstantBackoff(50))
          .onOpen(() => resolve(), { once: true })
          .build();
      });
      expect(urlProviderCalls).toBe(1);

      client!.addEventListener(WebsocketEvent.retry, () => retryCount++);
      client!.addEventListener(WebsocketEvent.close, (instance) => {
        if (!reconnectTriggered) {
          reconnectTriggered = true;
          instance.reconnect(); // event-driven recovery from inside the close-listener
        }
      });

      const reopened = new Promise<void>((resolve) =>
        client!.addEventListener(WebsocketEvent.open, () => resolve(), {
          once: true,
        }),
      );
      server?.clients.forEach((c) => c.terminate());
      await reopened;
      await sleep(300); // a stale duplicate retry would fire within this window

      expect(urlProviderCalls).toBe(2); // exactly one replacement socket
      expect(retryCount).toBe(0); // no retry was scheduled on top of the reconnect
      expect(client!.readyState).toBe(1); // OPEN
    },
    testTimeout,
  );

  test(
    "A retry-listener calling close() prevents the pending connection attempt",
    async () => {
      let urlProviderCalls = 0;
      const urlProvider = () => {
        urlProviderCalls++;
        return url;
      };

      await new Promise<void>((resolve) => {
        client = new WebsocketBuilder(urlProvider)
          .withBackoff(new ConstantBackoff(50))
          .onOpen(() => resolve(), { once: true })
          .build();
      });
      expect(urlProviderCalls).toBe(1);

      client!.addEventListener(WebsocketEvent.retry, (instance) =>
        instance.close(),
      );

      // take the server down entirely so a retry gets scheduled
      await stopServer(server, timeout);
      server = undefined;
      await sleep(300); // the retry fires at 50ms and must not open a socket

      expect(client!.closedByUser).toBe(true);
      expect(urlProviderCalls).toBe(1); // no new socket after close()
      expect(client!.underlyingWebsocket.readyState).toBe(3); // CLOSED, not CONNECTING
    },
    testTimeout,
  );

  test(
    "A retry-listener calling reconnect() creates exactly one new socket",
    async () => {
      let urlProviderCalls = 0;
      const urlProvider = () => {
        urlProviderCalls++;
        return url;
      };
      let reconnectTriggered = false;

      await new Promise<void>((resolve) => {
        client = new WebsocketBuilder(urlProvider)
          .withBackoff(new ConstantBackoff(50))
          .onOpen(() => resolve(), { once: true })
          .build();
      });
      expect(urlProviderCalls).toBe(1);

      client!.addEventListener(WebsocketEvent.retry, (instance) => {
        if (!reconnectTriggered) {
          reconnectTriggered = true;
          instance.reconnect(); // e.g. forcing a fresh URL immediately on retry
        }
      });

      const reopened = new Promise<void>((resolve) =>
        client!.addEventListener(WebsocketEvent.open, () => resolve(), {
          once: true,
        }),
      );
      server?.clients.forEach((c) => c.terminate());
      await reopened;
      await sleep(300);

      expect(urlProviderCalls).toBe(2); // the retry-handler must not replace the reconnect()-socket
      expect(client!.readyState).toBe(1); // OPEN
    },
    testTimeout,
  );

  test(
    "An error-listener calling reconnect() when the URL provider throws does not get a retry scheduled on top",
    async () => {
      let urlProviderCalls = 0;
      const urlProvider = () => {
        urlProviderCalls++;
        if (urlProviderCalls === 2) {
          throw new Error("no URL available"); // fails exactly on the first retry
        }
        return url;
      };
      let retryCount = 0;
      let reconnectTriggered = false;

      await new Promise<void>((resolve) => {
        client = new WebsocketBuilder(urlProvider)
          .withBackoff(new ConstantBackoff(50))
          .onOpen(() => resolve(), { once: true })
          .build();
      });
      expect(urlProviderCalls).toBe(1);

      client!.addEventListener(WebsocketEvent.retry, () => retryCount++);
      client!.addEventListener(WebsocketEvent.error, (instance) => {
        // react only to the URL-provider failure, which happens after the
        // first retry, not to a possible error event of the dropped connection
        if (!reconnectTriggered && retryCount >= 1) {
          reconnectTriggered = true;
          instance.reconnect(); // recover immediately instead of waiting for the backoff
        }
      });

      const reopened = new Promise<void>((resolve) =>
        client!.addEventListener(WebsocketEvent.open, () => resolve(), {
          once: true,
        }),
      );
      server?.clients.forEach((c) => c.terminate());
      await reopened;
      await sleep(300); // a stale duplicate retry would fire within this window

      expect(urlProviderCalls).toBe(3); // failed retry, then exactly one reconnect()-socket
      expect(retryCount).toBe(1); // no second retry was scheduled after the reconnect
      expect(client!.readyState).toBe(1); // OPEN
    },
    testTimeout,
  );

  test(
    "An open-listener calling close() prevents the buffer drain",
    async () => {
      const received: string[] = [];
      server?.on("connection", (socket) =>
        socket.on("message", (data) => received.push(data.toString())),
      );

      let closeOnOpen = false;
      await new Promise<void>((resolve) => {
        client = new WebsocketBuilder(url)
          .withBackoff(new ConstantBackoff(50))
          .withBuffer(new ArrayQueue())
          .onOpen((instance) => {
            if (closeOnOpen) instance.close();
            resolve();
          })
          .build();
      });

      client!.addEventListener(
        WebsocketEvent.close,
        (instance) => instance.send("sent-while-disconnected"), // socket is down: goes to the buffer
        { once: true },
      );
      closeOnOpen = true;
      server?.clients.forEach((c) => c.terminate());
      await sleep(300); // retry at 50ms reopens, the open-listener closes immediately

      expect(client!.closedByUser).toBe(true);
      expect(received).toEqual([]); // nothing was drained after close()
    },
    testTimeout,
  );

  test(
    "A reconnect-listener calling close() stops the 'open' dispatch and the buffer drain",
    async () => {
      let openCount = 0;
      const received: string[] = [];
      server?.on("connection", (socket) =>
        socket.on("message", (data) => received.push(data.toString())),
      );

      await new Promise<void>((resolve) => {
        client = new WebsocketBuilder(url)
          .withBackoff(new ConstantBackoff(50))
          .withBuffer(new ArrayQueue())
          .onOpen(() => {
            openCount++;
            resolve();
          })
          .onReconnect((instance) => instance.close())
          .build();
      });
      expect(openCount).toBe(1);

      client!.addEventListener(
        WebsocketEvent.close,
        (instance) => instance.send("sent-while-disconnected"), // socket is down: goes to the buffer
        { once: true },
      );
      server?.clients.forEach((c) => c.terminate());
      await sleep(300); // retry at 50ms reopens, reconnect-listener closes again

      expect(client!.closedByUser).toBe(true);
      expect(openCount).toBe(1); // no 'open' after the user closed during 'reconnect'
      expect(received).toEqual([]); // nothing was drained after close()
    },
    testTimeout,
  );
});

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

const startServer = (port: number, timeout: number): Promise<WebSocketServer> =>
  new Promise((resolve, reject) => {
    setTimeout(
      () => reject(new Error("Timeout: failed to start server")),
      timeout,
    );
    const wss = new WebSocketServer({ port });
    wss.on("listening", () => resolve(wss));
    wss.on("error", (err) => reject(err));
  });

const stopClient = (
  client: Websocket | undefined,
  timeout: number,
): Promise<void> =>
  new Promise((resolve, reject) => {
    if (client === undefined) return resolve();
    if (client.underlyingWebsocket.readyState === 3) return resolve(); // CLOSED
    setTimeout(
      () => reject(new Error("Timeout: failed to stop client")),
      timeout,
    );
    client.addEventListener(WebsocketEvent.close, () => resolve(), {
      once: true,
    });
    client.close();
  });

const stopServer = (
  wss: WebSocketServer | undefined,
  timeout: number,
): Promise<void> =>
  new Promise((resolve, reject) => {
    if (wss === undefined) return resolve();
    setTimeout(
      () => reject(new Error("Timeout: failed to stop server")),
      timeout,
    );
    wss.clients.forEach((c) => c.terminate());
    wss.addListener("close", resolve);
    wss.close();
  });
