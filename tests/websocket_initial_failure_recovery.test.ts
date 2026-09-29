import { WebSocketServer } from "ws";
import {
  ConstantBackoff,
  ExhaustedEventDetail,
  ReconnectEventDetail,
  Websocket,
  WebsocketBuilder,
  WebsocketEvent,
} from "../src";
import { describe, test, expect, afterEach } from "vitest";

/**
 * Regression tests for recovery from a server that is unavailable when the
 * websocket is constructed. The 'open'-handler used to treat a connection as
 * a reconnect only when a previous connection existed, so a successful retry
 * after initial connection failures neither emitted 'reconnect' nor reset
 * the backoff: the next outage silently inherited the already-spent retries.
 */
describe("Testsuite for recovery from an initially unavailable server", () => {
  // dedicated env var (not PORT) so this file never collides with
  // tests/websocket.test.ts when the whole suite runs in parallel
  const port: number = process.env.INITIAL_RECOVERY_PORT
    ? parseInt(process.env.INITIAL_RECOVERY_PORT)
    : 41424;
  const url = `ws://localhost:${port}`;
  const timeout = 5_000;
  const testTimeout = 15_000;

  let client: Websocket | undefined;
  let server: WebSocketServer | undefined;

  // no server in beforeEach: these tests start the server mid-test to
  // simulate a server that is unavailable while the client is constructed
  afterEach(async () => {
    await stopClient(client, timeout);
    client = undefined;
    await stopServer(server, timeout);
    server = undefined;
  }, testTimeout);

  test(
    "A successful retry after initial connection failures emits 'reconnect' and resets the retry budget",
    async () => {
      const reconnectDetails: ReconnectEventDetail[] = [];

      let resolveFirstFailure!: () => void;
      const firstFailure = new Promise<void>((r) => (resolveFirstFailure = r));
      let resolveOpened!: () => void;
      const opened = new Promise<void>((r) => (resolveOpened = r));

      client = new WebsocketBuilder(url)
        .withBackoff(new ConstantBackoff(50))
        .onClose(() => resolveFirstFailure(), { once: true })
        .onOpen(() => resolveOpened(), { once: true })
        .onReconnect((_, ev) => reconnectDetails.push(ev.detail))
        .build();

      await firstFailure; // at least one attempt failed before the server existed
      server = await startServer(port, timeout);
      await opened;

      expect(reconnectDetails).toHaveLength(1); // initial recovery is a reconnect
      expect(reconnectDetails[0].retries).toBeGreaterThanOrEqual(1);
      expect(reconnectDetails[0].lastConnection).toBeUndefined(); // there was no earlier connection
      expect(client.backoff!.retries).toBe(0); // fresh budget for the next outage
    },
    testTimeout,
  );

  test(
    "The next outage after initial-failure recovery has the full retry budget",
    async () => {
      const maxRetries = 5;
      const exhaustedDetails: ExhaustedEventDetail[] = [];
      let reopened = false;
      let retriesInSecondOutage = 0;

      let resolveFirstFailure!: () => void;
      const firstFailure = new Promise<void>((r) => (resolveFirstFailure = r));
      let resolveOpened!: () => void;
      const opened = new Promise<void>((r) => (resolveOpened = r));
      let resolveExhausted!: () => void;
      const exhausted = new Promise<void>((r) => (resolveExhausted = r));

      client = new WebsocketBuilder(url)
        .withBackoff(new ConstantBackoff(50))
        .withMaxRetries(maxRetries)
        .onClose(() => resolveFirstFailure(), { once: true })
        .onOpen(() => resolveOpened(), { once: true })
        .onRetry(() => {
          if (reopened) retriesInSecondOutage++;
        })
        .onExhausted((_, ev) => {
          exhaustedDetails.push(ev.detail);
          resolveExhausted();
        })
        .build();

      await firstFailure; // at least one retry is spent before the server exists
      server = await startServer(port, timeout);
      await opened;
      reopened = true;

      // take the server down again: the second outage must have the full budget
      await stopServer(server, timeout);
      server = undefined;
      await exhausted;

      expect(retriesInSecondOutage).toBe(maxRetries);
      expect(exhaustedDetails).toHaveLength(1);
      expect(exhaustedDetails[0].retries).toBe(maxRetries);
    },
    testTimeout,
  );

  test(
    "'reconnect' is not fired when no retry preceded the open, e.g. after a manual reconnect()",
    async () => {
      server = await startServer(port, timeout);
      let reconnectCount = 0;

      await new Promise<void>((resolve) => {
        client = new WebsocketBuilder(url)
          .withBackoff(new ConstantBackoff(50))
          .onOpen(() => resolve(), { once: true })
          .onReconnect(() => reconnectCount++)
          .build();
      });

      const reopened = new Promise<void>((resolve) =>
        client!.addEventListener(WebsocketEvent.open, () => resolve(), {
          once: true,
        }),
      );
      client!.reconnect();
      await reopened;

      expect(reconnectCount).toBe(0); // reconnect() emits 'open', but no retry preceded it
    },
    testTimeout,
  );
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
