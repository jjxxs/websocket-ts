import { WebSocketServer } from "ws";
import { ConstantBackoff, Websocket, WebsocketBuilder } from "../src";
import { WebsocketEvent, RetryEventDetail } from "../src";
import { describe, test, expect, beforeEach, afterEach } from "vitest";

describe("Testsuite for instantReconnect retry semantics", () => {
  // dedicated env var (not PORT) so this file never collides with
  // tests/websocket.test.ts when the whole suite runs in parallel
  const port: number = process.env.INSTANT_RECONNECT_PORT
    ? parseInt(process.env.INSTANT_RECONNECT_PORT)
    : 41401;
  const url: string = `ws://localhost:${port}`;
  const serverTimeout: number = process.env.SERVER_TIMEOUT
    ? parseInt(process.env.SERVER_TIMEOUT)
    : 5_000;
  const clientTimeout: number = process.env.CLIENT_TIMEOUT
    ? parseInt(process.env.CLIENT_TIMEOUT)
    : 5_000;
  const testTimeout: number = process.env.TEST_TIMEOUT
    ? parseInt(process.env.TEST_TIMEOUT)
    : 10_000;

  let client: Websocket | undefined;
  let server: WebSocketServer | undefined;

  beforeEach(async () => {
    await startServer(port, serverTimeout).then((s) => (server = s));
  }, testTimeout);

  afterEach(async () => {
    await stopClient(client, clientTimeout).then(() => (client = undefined));
    await stopServer(server, serverTimeout).then(() => (server = undefined));
  }, testTimeout);

  test(
    "instantReconnect should skip the backoff only for the first retry of an outage and respect maxRetries",
    async () => {
      const retryDetails: RetryEventDetail[] = [];

      // connect, then take the server down to start an outage
      await new Promise<void>((resolve) => {
        client = new WebsocketBuilder(url)
          .withBackoff(new ConstantBackoff(50))
          .withInstantReconnect(true)
          .withMaxRetries(3)
          .onOpen(() => resolve())
          .onRetry((_, ev) => retryDetails.push(ev.detail))
          .build();
      });
      await stopServer(server, serverTimeout).then(() => (server = undefined));

      // an instant retry (0ms) plus two backoff retries (50ms each) fit well
      // within this window; the buggy zero-delay loop produces dozens of
      // retries in the same time
      await new Promise((resolve) => setTimeout(resolve, 600));

      // maxRetries must bound the number of retries
      expect(retryDetails).toHaveLength(3);

      // the event details must report the true retry count, not a constant 0
      expect(retryDetails.map((d) => d.retries)).toEqual([1, 2, 3]);

      // only the first retry of the outage is instant, the rest use the backoff
      expect(retryDetails.map((d) => d.backoff)).toEqual([0, 50, 50]);
    },
    testTimeout,
  );
});

/**
 * Creates a promise that will be rejected after the given amount of milliseconds.
 * @param ms the amount of milliseconds to wait before rejecting
 * @param msg an optional message to include in the error
 */
const rejectAfter = (ms: number, msg?: string): Promise<void> =>
  new Promise((_, reject) =>
    setTimeout(
      () => reject(msg ? new Error(`Timeout: ${msg}`) : new Error(`Timeout`)),
      ms,
    ),
  );

/**
 * Stops the given websocket client.
 * @param client the websocket client to stop
 * @param timeout the amount of milliseconds to wait before rejecting
 */
const stopClient = (
  client: Websocket | undefined,
  timeout: number,
): Promise<void> =>
  new Promise<void>((resolve, reject) => {
    if (client === undefined) return resolve();
    if (client.underlyingWebsocket?.readyState === 3) return resolve(); // CLOSED
    rejectAfter(timeout, "failed to stop client").catch((err) => reject(err));
    client.addEventListener(WebsocketEvent.close, () => resolve(), {
      once: true,
    });
    client.close();
  });

/**
 * Starts a websocket server on the given port.
 * @param port the port to start the server on
 * @param timeout the amount of milliseconds to wait before rejecting
 */
const startServer = (port: number, timeout: number): Promise<WebSocketServer> =>
  new Promise((resolve, reject) => {
    rejectAfter(timeout, "failed to start server").catch((err) => reject(err));
    const wss = new WebSocketServer({ port });
    wss.on("listening", () => resolve(wss));
    wss.on("error", (err) => reject(err));
  });

/**
 * Stops the given websocket server. This will terminate all connections.
 * @param wss the websocket server to stop
 * @param timeout the amount of milliseconds to wait before rejecting
 */
const stopServer = (
  wss: WebSocketServer | undefined,
  timeout: number,
): Promise<void> =>
  new Promise<void>((resolve, reject) => {
    if (wss === undefined) return resolve();
    rejectAfter(timeout, "failed to stop server").catch((err) => reject(err));
    wss.clients.forEach((c) => c.terminate());
    wss.addListener("close", resolve);
    wss.close();
  });
