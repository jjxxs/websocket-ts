import { WebSocketServer } from "ws";
import {
  ConstantBackoff,
  ExhaustedEventDetail,
  Websocket,
  WebsocketBuilder,
  WebsocketEvent,
} from "../src";
import { describe, test, expect, beforeEach, afterEach } from "vitest";

describe("Testsuite for the exhausted event and reconnect()", () => {
  // dedicated env var (not PORT) so this file never collides with
  // tests/websocket.test.ts when the whole suite runs in parallel
  const port: number = process.env.EXHAUSTED_RECONNECT_PORT
    ? parseInt(process.env.EXHAUSTED_RECONNECT_PORT)
    : 41421;
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

  describe("Exhausted event", () => {
    test(
      "Websocket should fire 'exhausted' exactly once after maxRetries failed retries and stop retrying",
      async () => {
        let retryCount = 0;
        const exhaustedDetails: ExhaustedEventDetail[] = [];

        await new Promise<void>((resolve) => {
          client = new WebsocketBuilder(url)
            .withBackoff(new ConstantBackoff(50))
            .withMaxRetries(2)
            .onOpen(() => resolve())
            .onRetry(() => retryCount++)
            .onExhausted((_, ev) => exhaustedDetails.push(ev.detail))
            .build();
        });
        await stopServer(server, serverTimeout).then(
          () => (server = undefined),
        );

        // two retries at 50ms each plus failure latency fit well within this window
        await new Promise((resolve) => setTimeout(resolve, 600));

        expect(retryCount).toBe(2);
        expect(exhaustedDetails).toHaveLength(1);
        expect(exhaustedDetails[0].retries).toBe(2); // retries actually performed == maxRetries
        expect(exhaustedDetails[0].lastConnection).not.toBeUndefined();
      },
      testTimeout,
    );

    test(
      "Websocket should not fire 'exhausted' when the connection is reestablished within the retry budget",
      async () => {
        let exhaustedCount = 0;
        let reconnectCount = 0;

        await new Promise<void>((resolve) => {
          client = new WebsocketBuilder(url)
            .withBackoff(new ConstantBackoff(50))
            .withMaxRetries(5)
            .onOpen(() => resolve())
            .onReconnect(() => reconnectCount++)
            .onExhausted(() => exhaustedCount++)
            .build();
        });

        // drop the connection but keep the server running, so the retry succeeds
        server?.clients.forEach((c) => c.terminate());
        await new Promise((resolve) => setTimeout(resolve, 300));

        expect(reconnectCount).toBe(1);
        expect(exhaustedCount).toBe(0);
      },
      testTimeout,
    );
  });

  describe("Reconnect method", () => {
    test(
      "reconnect() after 'exhausted' should resume with a fresh retry budget",
      async () => {
        const exhausted = new Promise<void>((done) => {
          void new Promise<void>((resolve) => {
            client = new WebsocketBuilder(url)
              .withBackoff(new ConstantBackoff(50))
              .withMaxRetries(1)
              .onOpen(() => resolve(), { once: true })
              .onExhausted(() => done())
              .build();
          });
        });
        await stopServer(server, serverTimeout).then(
          () => (server = undefined),
        );
        await exhausted;

        // bring the server back and resume manually
        await startServer(port, serverTimeout).then((s) => (server = s));
        const reopened = new Promise<void>((resolve) =>
          client!.addEventListener(WebsocketEvent.open, () => resolve(), {
            once: true,
          }),
        );
        client!.reconnect();
        await reopened;

        expect(client!.readyState).toBe(1); // OPEN
        expect(client!.backoff!.retries).toBe(0); // fresh retry budget
      },
      testTimeout,
    );

    test(
      "reconnect() should revive a websocket that was closed by the user",
      async () => {
        await new Promise<void>((resolve) => {
          client = new WebsocketBuilder(url).onOpen(() => resolve()).build();
        });

        const closed = new Promise<void>((resolve) =>
          client!.addEventListener(WebsocketEvent.close, () => resolve(), {
            once: true,
          }),
        );
        client!.close();
        await closed;
        expect(client!.closedByUser).toBe(true);

        const reopened = new Promise<void>((resolve) =>
          client!.addEventListener(WebsocketEvent.open, () => resolve(), {
            once: true,
          }),
        );
        client!.reconnect();
        await reopened;

        expect(client!.closedByUser).toBe(false);
        expect(client!.readyState).toBe(1); // OPEN
      },
      testTimeout,
    );

    test(
      "reconnect() on an open websocket should create a new underlying websocket and re-resolve the URL provider",
      async () => {
        let urlProviderCalls = 0;
        const urlProvider = () => {
          urlProviderCalls++;
          return url;
        };

        await new Promise<void>((resolve) => {
          client = new WebsocketBuilder(urlProvider)
            .onOpen(() => resolve(), { once: true })
            .build();
        });
        const firstUnderlying = client!.underlyingWebsocket;
        expect(urlProviderCalls).toBe(1);

        const reopened = new Promise<void>((resolve) =>
          client!.addEventListener(WebsocketEvent.open, () => resolve(), {
            once: true,
          }),
        );
        client!.reconnect();
        await reopened;

        expect(urlProviderCalls).toBe(2);
        expect(client!.underlyingWebsocket).not.toBe(firstUnderlying);
        expect(client!.readyState).toBe(1); // OPEN
      },
      testTimeout,
    );
  });

  describe("Retry options require a backoff", () => {
    test("Websocket constructor should throw when maxRetries is set without a backoff", () => {
      expect(
        () => new Websocket(url, undefined, { retry: { maxRetries: 5 } }),
      ).toThrow();
    });

    test("Websocket constructor should throw when instantReconnect is set without a backoff", () => {
      expect(
        () =>
          new Websocket(url, undefined, { retry: { instantReconnect: true } }),
      ).toThrow();
    });

    test("WebsocketBuilder.build() should throw when retry options are set without a backoff", () => {
      expect(() =>
        new WebsocketBuilder(url).withMaxRetries(5).build(),
      ).toThrow();
      expect(() =>
        new WebsocketBuilder(url).withInstantReconnect(true).build(),
      ).toThrow();
    });

    test("Websocket constructor should not throw when retry options are set with a backoff", () => {
      client = new WebsocketBuilder(url)
        .withBackoff(new ConstantBackoff(1000))
        .withMaxRetries(5)
        .withInstantReconnect(true)
        .build();
      expect(client.maxRetries).toBe(5);
    });
  });

  describe("MaxRetries must be a non-negative integer", () => {
    // NaN and Infinity would never exhaust, negative values exhaust before
    // any retry, and fractions break the promise that the exhausted-detail
    // retries equal the configured limit
    test.each([NaN, Infinity, -Infinity, -1, 2.5])(
      "Websocket constructor should throw when maxRetries is %f",
      (maxRetries) => {
        expect(
          () =>
            new Websocket(url, undefined, {
              retry: { maxRetries, backoff: new ConstantBackoff(1000) },
            }),
        ).toThrow("MaxRetries must be undefined or a non-negative integer");
      },
    );

    test("WebsocketBuilder.build() should throw when maxRetries is invalid", () => {
      expect(() =>
        new WebsocketBuilder(url)
          .withBackoff(new ConstantBackoff(1000))
          .withMaxRetries(NaN)
          .build(),
      ).toThrow("MaxRetries must be undefined or a non-negative integer");
    });

    test(
      "A maxRetries of zero is valid and exhausts on the first disconnect without retrying",
      async () => {
        let retryCount = 0;
        const exhaustedDetails: ExhaustedEventDetail[] = [];

        await new Promise<void>((resolve) => {
          client = new WebsocketBuilder(url)
            .withBackoff(new ConstantBackoff(50))
            .withMaxRetries(0)
            .onOpen(() => resolve())
            .onRetry(() => retryCount++)
            .onExhausted((_, ev) => exhaustedDetails.push(ev.detail))
            .build();
        });
        await stopServer(server, serverTimeout).then(
          () => (server = undefined),
        );

        await new Promise((resolve) => setTimeout(resolve, 300));

        expect(retryCount).toBe(0); // the budget is zero: no retry at all
        expect(exhaustedDetails).toHaveLength(1);
        expect(exhaustedDetails[0].retries).toBe(0);
      },
      testTimeout,
    );
  });
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
