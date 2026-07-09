import { WebSocketServer } from "ws";
import {
  Websocket,
  WebsocketBuilder,
  WebsocketEvent,
  WebsocketEventListenerWithOptions,
} from "../src";
import { describe, test, expect, beforeEach, afterEach, vi } from "vitest";

describe("Testsuite for listener options (once/signal)", () => {
  // dedicated env var (not PORT) so this file never collides with
  // tests/websocket.test.ts when the whole suite runs in parallel
  const port: number = process.env.LISTENER_OPTIONS_PORT
    ? parseInt(process.env.LISTENER_OPTIONS_PORT)
    : 41431;
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

  describe("AbortSignal", () => {
    test("Websocket should never register a listener whose signal is already aborted", () => {
      const controller = new AbortController();
      controller.abort();

      client = new Websocket(url);
      client.addEventListener(WebsocketEvent.message, () => undefined, {
        signal: controller.signal,
      });

      expect(
        getListenersWithOptions(client, WebsocketEvent.message),
      ).toHaveLength(0);
    });

    test("Websocket should remove a listener when its signal is aborted", () => {
      const controller = new AbortController();

      client = new Websocket(url);
      client.addEventListener(WebsocketEvent.message, () => undefined, {
        signal: controller.signal,
      });
      expect(
        getListenersWithOptions(client, WebsocketEvent.message),
      ).toHaveLength(1);

      controller.abort();
      expect(
        getListenersWithOptions(client, WebsocketEvent.message),
      ).toHaveLength(0);
    });

    test("Websocket should remove all listeners registered with the same signal when it is aborted", () => {
      const controller = new AbortController();

      client = new Websocket(url);
      client.addEventListener(WebsocketEvent.message, () => undefined, {
        signal: controller.signal,
      });
      client.addEventListener(WebsocketEvent.close, () => undefined, {
        signal: controller.signal,
      });
      client.addEventListener(WebsocketEvent.open, () => undefined, {
        signal: controller.signal,
      });

      controller.abort(); // one abort tears down the whole group
      expect(
        getListenersWithOptions(client, WebsocketEvent.message),
      ).toHaveLength(0);
      expect(
        getListenersWithOptions(client, WebsocketEvent.close),
      ).toHaveLength(0);
      expect(getListenersWithOptions(client, WebsocketEvent.open)).toHaveLength(
        0,
      );
    });

    test("Aborting a signal should remove only the registration made with it, not other registrations of the same listener", () => {
      const controller = new AbortController();
      const listener = () => undefined;

      client = new Websocket(url);
      client.addEventListener(WebsocketEvent.message, listener, {
        signal: controller.signal,
      });
      client.addEventListener(WebsocketEvent.message, listener); // no signal
      expect(
        getListenersWithOptions(client, WebsocketEvent.message),
      ).toHaveLength(2);

      controller.abort();
      expect(getListenersWithOptions(client, WebsocketEvent.message)).toEqual([
        { listener, options: undefined },
      ]);
    });

    test(
      "Websocket should stop delivering events to a listener after its signal is aborted",
      async () => {
        const controller = new AbortController();
        const received: string[] = [];

        await new Promise<void>((resolve) => {
          client = new WebsocketBuilder(url)
            .onOpen(() => resolve(), { once: true })
            .build();
        });
        client!.addEventListener(
          WebsocketEvent.message,
          (_, ev) => received.push(ev.data as string),
          { signal: controller.signal },
        );

        await sendFromServerAndWait(server, "before-abort");
        expect(received).toEqual(["before-abort"]);

        controller.abort();
        await sendFromServerAndWait(server, "after-abort");
        expect(received).toEqual(["before-abort"]); // second message not delivered
      },
      testTimeout,
    );

    test(
      "A once-listener with a signal should fire once and its abort-handler should be unhooked",
      async () => {
        const controller = new AbortController();
        const signalRemoveSpy = vi.spyOn(
          controller.signal,
          "removeEventListener",
        );
        const received: string[] = [];

        await new Promise<void>((resolve) => {
          client = new WebsocketBuilder(url)
            .onOpen(() => resolve(), { once: true })
            .build();
        });
        client!.addEventListener(
          WebsocketEvent.message,
          (_, ev) => received.push(ev.data as string),
          { once: true, signal: controller.signal },
        );

        await sendFromServerAndWait(server, "only-once");
        await sendFromServerAndWait(server, "not-delivered");
        expect(received).toEqual(["only-once"]);
        expect(
          getListenersWithOptions(client, WebsocketEvent.message),
        ).toHaveLength(0);
        expect(signalRemoveSpy).toHaveBeenCalledWith(
          "abort",
          expect.any(Function),
        );
      },
      testTimeout,
    );

    test("removeEventListener should unhook the abort-handler of the removed registration", () => {
      const controller = new AbortController();
      const signalRemoveSpy = vi.spyOn(
        controller.signal,
        "removeEventListener",
      );
      const listener = () => undefined;

      client = new Websocket(url);
      client.addEventListener(WebsocketEvent.message, listener, {
        signal: controller.signal,
      });
      client.removeEventListener(WebsocketEvent.message, listener);

      expect(
        getListenersWithOptions(client, WebsocketEvent.message),
      ).toHaveLength(0);
      expect(signalRemoveSpy).toHaveBeenCalledWith(
        "abort",
        expect.any(Function),
      );

      // aborting afterwards must be a harmless no-op
      controller.abort();
      expect(
        getListenersWithOptions(client, WebsocketEvent.message),
      ).toHaveLength(0);
    });

    test("Initial listeners provided via the builder should honor their signal", () => {
      const abortedController = new AbortController();
      abortedController.abort();
      const controller = new AbortController();

      client = new WebsocketBuilder(url)
        .onMessage(() => undefined, { signal: abortedController.signal })
        .onMessage(() => undefined, { signal: controller.signal })
        .build();

      // the already-aborted registration is dropped at construction
      expect(
        getListenersWithOptions(client, WebsocketEvent.message),
      ).toHaveLength(1);

      controller.abort();
      expect(
        getListenersWithOptions(client, WebsocketEvent.message),
      ).toHaveLength(0);
    });
  });

  describe("Type surface", () => {
    test("WebsocketEventListenerOptions should reject options that are not honored", () => {
      client = new Websocket(url);
      client.addEventListener(WebsocketEvent.message, () => undefined, {
        // @ts-expect-error 'capture' has no meaning on a websocket and is not supported
        capture: true,
      });
      client.addEventListener(WebsocketEvent.message, () => undefined, {
        // @ts-expect-error 'passive' has no meaning on a websocket and is not supported
        passive: true,
      });
    });
  });
});

/**
 * Sends a message to all clients of the given server and waits a moment for delivery.
 *
 * @param wss the websocket server to send the message from
 * @param message the message to send
 */
const sendFromServerAndWait = async (
  wss: WebSocketServer | undefined,
  message: string,
): Promise<void> => {
  wss?.clients.forEach((c) => c.send(message));
  await new Promise((resolve) => setTimeout(resolve, 100));
};

/**
 * Returns the listeners for the given event type on the given websocket client.
 *
 * @param client the websocket client to get the listeners from
 * @param type the event type to get the listeners for
 */
const getListenersWithOptions = <K extends WebsocketEvent>(
  client: Websocket | undefined,
  type: K,
): WebsocketEventListenerWithOptions<K>[] =>
  client === undefined ? [] : (client["_options"]["listeners"][type] ?? []);

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
