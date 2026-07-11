import { WebSocketServer } from "ws";
import {
  ArrayQueue,
  ConstantBackoff,
  Websocket,
  WebsocketBuilder,
  WebsocketEvent,
} from "../src";
import { describe, test, expect, beforeEach, afterEach, vi } from "vitest";

/**
 * Regression tests for exception isolation during event dispatch. A throwing
 * user listener used to propagate out of dispatchEvent, which skipped the
 * remaining listeners of the same event and aborted the internal lifecycle
 * work that runs after dispatch: retry scheduling after 'close', socket
 * replacement after 'retry', backoff reset and buffer draining around 'open'.
 * Caught exceptions are reported via globalThis.reportError when available
 * and rethrown asynchronously otherwise, mirroring the native EventTarget.
 */
describe("Testsuite for exceptions thrown by event listeners", () => {
  // dedicated env var (not PORT) so this file never collides with
  // tests/websocket.test.ts when the whole suite runs in parallel
  const port: number = process.env.LISTENER_EXCEPTION_PORT
    ? parseInt(process.env.LISTENER_EXCEPTION_PORT)
    : 41423;
  const url = `ws://localhost:${port}`;
  const timeout = 5_000;
  const testTimeout = 10_000;

  let client: Websocket | undefined;
  let server: WebSocketServer | undefined;
  let reportedErrors: unknown[];

  beforeEach(async () => {
    // collect errors reported by the dispatcher instead of letting them
    // surface as unhandled errors in the test runner
    reportedErrors = [];
    vi.stubGlobal("reportError", (err: unknown) => reportedErrors.push(err));
    server = await startServer(port, timeout);
  }, testTimeout);

  afterEach(async () => {
    vi.useRealTimers();
    await stopClient(client, timeout); // before unstubbing: teardown may re-fire throwing listeners
    client = undefined;
    await stopServer(server, timeout);
    server = undefined;
    vi.unstubAllGlobals();
  }, testTimeout);

  test(
    "A throwing 'close'-listener does not stop later listeners or retry scheduling",
    async () => {
      const boom = new Error("close listener boom");
      let laterListenerCalls = 0;
      let retryCount = 0;
      let openCount = 0;

      await new Promise<void>((resolve) => {
        client = new WebsocketBuilder(url)
          .withBackoff(new ConstantBackoff(50))
          .onOpen(() => {
            openCount++;
            resolve();
          })
          .build();
      });
      client!.addEventListener(WebsocketEvent.close, () => {
        throw boom;
      });
      client!.addEventListener(
        WebsocketEvent.close,
        () => laterListenerCalls++,
      );
      client!.addEventListener(WebsocketEvent.retry, () => retryCount++);

      // drop the connection but keep the server running, so the retry succeeds
      server?.clients.forEach((c) => c.terminate());
      await sleep(400);

      expect(laterListenerCalls).toBeGreaterThanOrEqual(1); // later close-listener still ran
      expect(retryCount).toBeGreaterThanOrEqual(1); // recovery was still scheduled
      expect(openCount).toBe(2); // and the websocket reconnected
      expect(reportedErrors).toContain(boom);
    },
    testTimeout,
  );

  test(
    "A throwing 'open'-listener does not stop later listeners or the buffer drain",
    async () => {
      const boom = new Error("open listener boom");
      const received: string[] = [];
      server?.on("connection", (socket) =>
        socket.on("message", (data) => received.push(data.toString())),
      );

      let laterListenerCalls = 0;
      client = new WebsocketBuilder(url)
        .withBuffer(new ArrayQueue())
        .onOpen(() => {
          throw boom;
        })
        .onOpen(() => laterListenerCalls++)
        .build();
      client.send("buffered-while-connecting"); // still CONNECTING, goes to the buffer

      await sleep(300);

      expect(laterListenerCalls).toBe(1); // later open-listener still ran
      expect(received).toEqual(["buffered-while-connecting"]); // buffer was still drained
      expect(reportedErrors).toContain(boom);
    },
    testTimeout,
  );

  test(
    "A throwing 'retry'-listener does not prevent the next connection attempt",
    async () => {
      const boom = new Error("retry listener boom");
      let openCount = 0;

      await new Promise<void>((resolve) => {
        client = new WebsocketBuilder(url)
          .withBackoff(new ConstantBackoff(50))
          .onOpen(() => {
            openCount++;
            resolve();
          })
          .build();
      });
      client!.addEventListener(WebsocketEvent.retry, () => {
        throw boom;
      });

      server?.clients.forEach((c) => c.terminate());
      await sleep(400);

      expect(openCount).toBe(2); // reconnected despite the throwing retry-listener
      expect(reportedErrors).toContain(boom);
    },
    testTimeout,
  );

  test(
    "A throwing 'reconnect'-listener does not prevent the backoff reset or the 'open' dispatch",
    async () => {
      const boom = new Error("reconnect listener boom");
      let openCount = 0;

      await new Promise<void>((resolve) => {
        client = new WebsocketBuilder(url)
          .withBackoff(new ConstantBackoff(50))
          .onOpen(() => {
            openCount++;
            resolve();
          })
          .onReconnect(() => {
            throw boom;
          })
          .build();
      });

      server?.clients.forEach((c) => c.terminate());
      await sleep(400);

      expect(openCount).toBe(2); // 'open' was dispatched after the reconnect
      expect(client!.backoff!.retries).toBe(0); // the retry budget was reset
      expect(reportedErrors).toContain(boom);
    },
    testTimeout,
  );

  test(
    "A throwing 'message'-listener does not stop later 'message'-listeners",
    async () => {
      const boom = new Error("message listener boom");
      const receivedByLater: string[] = [];

      client = await connectedClient(url, timeout);
      client.addEventListener(WebsocketEvent.message, () => {
        throw boom;
      });
      client.addEventListener(WebsocketEvent.message, (_, ev) =>
        receivedByLater.push(ev.data as string),
      );

      server?.clients.forEach((c) => c.send("msg1"));
      await sleep(200);

      expect(receivedByLater).toEqual(["msg1"]);
      expect(reportedErrors).toContain(boom);
    },
    testTimeout,
  );

  test(
    "Listener exceptions are rethrown asynchronously when reportError is unavailable",
    async () => {
      vi.stubGlobal("reportError", undefined); // simulate runtimes without reportError, e.g. Node.js
      const boom = new Error("no reportError boom");
      let laterListenerCalls = 0;

      client = await connectedClient(url, timeout);
      client.addEventListener(WebsocketEvent.message, () => {
        throw boom;
      });
      client.addEventListener(
        WebsocketEvent.message,
        () => laterListenerCalls++,
      );

      // fake timers *after* connecting: only the async rethrow is captured
      vi.useFakeTimers();
      client["handleMessageEvent"](new MessageEvent("message", { data: "x" }));

      expect(laterListenerCalls).toBe(1); // dispatch continued past the throwing listener
      expect(() => vi.runAllTimers()).toThrow(boom); // the exception resurfaces asynchronously
    },
    testTimeout,
  );
});

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

const connectedClient = (url: string, timeout: number): Promise<Websocket> =>
  new Promise((resolve, reject) => {
    setTimeout(
      () => reject(new Error("Timeout: client failed to connect")),
      timeout,
    );
    const ws = new WebsocketBuilder(url)
      .onOpen((instance) => resolve(instance), { once: true })
      .build();
    void ws;
  });

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
