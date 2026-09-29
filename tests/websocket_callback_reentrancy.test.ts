import { WebSocketServer } from "ws";
import type { AddressInfo } from "node:net";
import {
  ConstantBackoff,
  Websocket,
  WebsocketBuilder,
  WebsocketEvent,
} from "../src";
import { describe, test, expect, beforeEach, afterEach, vi } from "vitest";

/**
 * Regression tests for close()/reconnect() calls made from inside the URL
 * provider. The provider runs in the middle of a connection attempt; without
 * a re-check afterwards, a provider calling close() still got a socket opened
 * after the wrapper was marked closed by the user, and a provider calling
 * reconnect() got the nested attempt's socket overwritten and orphaned.
 *
 * Every underlying socket the wrapper constructs is recorded (see the stubbed
 * WebSocket below), so "no socket was created" is asserted synchronously
 * instead of inferred from an observation window.
 */
const timeout = 5_000;
const testTimeout = 10_000;

let server: WebSocketServer;
let url: string;
let client: Websocket | undefined;
let created: WebSocket[]; // every underlying socket constructed, in order

beforeEach(async () => {
  server = await startServer(timeout);
  url = `ws://127.0.0.1:${(server.address() as AddressInfo).port}`;
  created = [];
  const NativeWebSocket = globalThis.WebSocket;
  vi.stubGlobal(
    "WebSocket",
    class extends NativeWebSocket {
      constructor(url: string | URL, protocols?: string | string[]) {
        super(url, protocols);
        created.push(this);
      }
    },
  );
}, testTimeout);

afterEach(async () => {
  client?.close(); // cancels pending retries, so no wrapper outlives its test
  client = undefined;
  created.forEach((socket) => socket.close()); // including sockets the wrapper no longer references
  vi.unstubAllGlobals();
  await stopServer(server, timeout);
}, testTimeout);

const connect = async (builder: WebsocketBuilder): Promise<Websocket> => {
  client = builder.build();
  await nextOpen(client, timeout);
  return client;
};

const expectAllCreatedSocketsClosing = () =>
  created.forEach(
    (socket) => expect(socket.readyState).toBeGreaterThanOrEqual(2), // CLOSING or CLOSED
  );

describe("Testsuite for URL provider reentrancy", () => {
  test(
    "A URL provider calling close() during a manual reconnect() creates no socket",
    async () => {
      let urlProviderCalls = 0;
      const ws = await connect(
        new WebsocketBuilder(() => {
          if (++urlProviderCalls === 2) client!.close(); // e.g. synchronous logout
          return url;
        }),
      );

      ws.reconnect();

      expect(urlProviderCalls).toBe(2);
      expect(created.length).toBe(1); // the superseded attempt constructed no socket
      expect(ws.closedByUser).toBe(true);
      expectAllCreatedSocketsClosing();
      await serverConnectionsClosed(server, timeout);
      expect(server.clients.size).toBe(0);
    },
    testTimeout,
  );

  test(
    "A URL provider calling reconnect() during a manual reconnect() commits only the nested attempt",
    async () => {
      let urlProviderCalls = 0;
      const ws = await connect(
        new WebsocketBuilder(() => {
          urlProviderCalls++;
          if (urlProviderCalls === 2) {
            client!.reconnect(); // nested, once
            return `${url}/?attempt=outer`;
          }
          return `${url}/?attempt=${urlProviderCalls === 3 ? "nested" : "initial"}`;
        }),
      );
      const reopened = nextOpen(ws, timeout);

      ws.reconnect();

      expect(urlProviderCalls).toBe(3); // initial, outer attempt, nested attempt
      expect(created.length).toBe(2); // initial and nested; the outer attempt constructed none
      expect(ws.underlyingWebsocket).toBe(created[1]);
      expect(ws.url).toBe(`${url}/?attempt=nested`);

      await reopened;
      ws.close();
      expectAllCreatedSocketsClosing(); // no orphan survives close()
      await serverConnectionsClosed(server, timeout);
      expect(server.clients.size).toBe(0);
    },
    testTimeout,
  );

  test(
    "A URL provider calling close() during an automatic retry creates no socket and stops retrying",
    async () => {
      let urlProviderCalls = 0;
      let retryCount = 0;
      const secondCall = deferred();
      const ws = await connect(
        new WebsocketBuilder(() => {
          if (++urlProviderCalls === 2) {
            client!.close();
            secondCall.resolve();
          }
          return url;
        })
          .withBackoff(new ConstantBackoff(10))
          .onRetry(() => retryCount++),
      );

      server.clients.forEach((c) => c.terminate());
      await withTimeout(secondCall.promise, timeout); // resumes after the retry handler returned

      expect(created.length).toBe(1);
      expect(ws.closedByUser).toBe(true);

      await sleep(100); // negative check: a further retry would fire after 10ms
      expect(retryCount).toBe(1);
      expect(urlProviderCalls).toBe(2);
      expect(created.length).toBe(1);
    },
    testTimeout,
  );

  test(
    "A URL provider calling reconnect() during an automatic retry commits only the nested attempt",
    async () => {
      let urlProviderCalls = 0;
      let retryCount = 0;
      const secondCall = deferred();
      const ws = await connect(
        new WebsocketBuilder(() => {
          if (++urlProviderCalls === 2) {
            client!.reconnect(); // nested, once
            secondCall.resolve();
          }
          return url;
        })
          .withBackoff(new ConstantBackoff(10))
          .onRetry(() => retryCount++),
      );
      const reopened = nextOpen(ws, timeout);

      server.clients.forEach((c) => c.terminate());
      await withTimeout(secondCall.promise, timeout);

      expect(urlProviderCalls).toBe(3); // initial, retry attempt, nested attempt
      expect(created.length).toBe(2);
      expect(ws.underlyingWebsocket).toBe(created[1]);

      await reopened;
      expect(retryCount).toBe(1);
      ws.close();
      expectAllCreatedSocketsClosing();
      await serverConnectionsClosed(server, timeout);
      expect(server.clients.size).toBe(0);
    },
    testTimeout,
  );

  test(
    "The URL provider is called without the websocket as receiver",
    async () => {
      const receivers: unknown[] = [];
      const ws = await connect(
        new WebsocketBuilder(function (this: unknown) {
          receivers.push(this);
          try {
            (this as Websocket).close(); // re-entry via the receiver is impossible
          } catch {
            // expected: there is no receiver
          }
          return url;
        }),
      );
      const reopened = nextOpen(ws, timeout);

      ws.reconnect();
      await reopened;

      expect(receivers).toEqual([undefined, undefined]);
      expect(ws.closedByUser).toBe(false);
      expect(ws.underlyingWebsocket).toBe(created[1]);
    },
    testTimeout,
  );

  test(
    "A URL rejected by the WebSocket constructor leaves url unchanged",
    async () => {
      let urlProviderCalls = 0;
      const ws = await connect(
        new WebsocketBuilder(() =>
          ++urlProviderCalls === 2 ? "not a websocket url" : url,
        ),
      );

      let thrown: unknown;
      try {
        ws.reconnect();
      } catch (e) {
        thrown = e;
      }

      expect((thrown as Error).name).toBe("SyntaxError"); // propagated unchanged
      expect(ws.url).toBe(url);
      expect(created.length).toBe(1);
    },
    testTimeout,
  );

  test(
    "A URL provider calling close() and then throwing during an automatic retry reports one error and stops",
    async () => {
      let urlProviderCalls = 0;
      let retryCount = 0;
      let errorsAfterRetry = 0;
      const secondCall = deferred();
      const ws = await connect(
        new WebsocketBuilder(() => {
          if (++urlProviderCalls === 2) {
            client!.close();
            secondCall.resolve();
            throw new Error("token unavailable");
          }
          return url;
        })
          .withBackoff(new ConstantBackoff(10))
          .onRetry(() => retryCount++)
          .onError(() => {
            if (retryCount > 0) errorsAfterRetry++;
          }),
      );

      server.clients.forEach((c) => c.terminate());
      await withTimeout(secondCall.promise, timeout);

      expect(errorsAfterRetry).toBe(1);
      expect(ws.closedByUser).toBe(true);

      await sleep(100);
      expect(retryCount).toBe(1);
      expect(created.length).toBe(1);
    },
    testTimeout,
  );

  test(
    "A URL provider whose nested reconnect() throws during an automatic retry reports one error and stops",
    async () => {
      let urlProviderCalls = 0;
      let retryCount = 0;
      let errorsAfterRetry = 0;
      const secondCall = deferred();
      const ws = await connect(
        new WebsocketBuilder(() => {
          urlProviderCalls++;
          if (urlProviderCalls === 2) {
            try {
              client!.reconnect(); // the nested attempt throws below
            } finally {
              secondCall.resolve();
            }
          }
          if (urlProviderCalls === 3) throw new Error("token unavailable");
          return url;
        })
          .withBackoff(new ConstantBackoff(10))
          .onRetry(() => retryCount++)
          .onError(() => {
            if (retryCount > 0) errorsAfterRetry++;
          }),
      );

      server.clients.forEach((c) => c.terminate());
      await withTimeout(secondCall.promise, timeout);

      expect(urlProviderCalls).toBe(3);
      expect(errorsAfterRetry).toBe(1);

      // same state as a directly thrown manual reconnect(): no socket, no retry
      await sleep(100);
      expect(retryCount).toBe(1);
      expect(created.length).toBe(1);
      expect(ws.closedByUser).toBe(false);
    },
    testTimeout,
  );
});

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

const deferred = () => {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => (resolve = r));
  return { promise, resolve };
};

const withTimeout = <T>(promise: Promise<T>, timeout: number): Promise<T> =>
  new Promise<T>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error("Timeout: condition not reached")),
      timeout,
    );
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });

const nextOpen = (client: Websocket, timeout: number): Promise<void> =>
  withTimeout(
    new Promise<void>((resolve) =>
      client.addEventListener(WebsocketEvent.open, () => resolve(), {
        once: true,
      }),
    ),
    timeout,
  );

const serverConnectionsClosed = (
  server: WebSocketServer,
  timeout: number,
): Promise<unknown> =>
  withTimeout(
    Promise.all(
      [...server.clients].map(
        (c) => new Promise<void>((resolve) => c.once("close", () => resolve())),
      ),
    ),
    timeout,
  );

const startServer = (timeout: number): Promise<WebSocketServer> =>
  withTimeout(
    new Promise<WebSocketServer>((resolve, reject) => {
      const wss = new WebSocketServer({ port: 0, host: "127.0.0.1" });
      wss.on("listening", () => resolve(wss));
      wss.on("error", (err) => reject(err));
    }),
    timeout,
  );

const stopServer = (server: WebSocketServer, timeout: number): Promise<void> =>
  withTimeout(
    new Promise<void>((resolve) => {
      server.clients.forEach((c) => c.terminate());
      server.close(() => resolve());
    }),
    timeout,
  );
