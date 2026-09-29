import { WebSocketServer } from "ws";
import { ConstantBackoff, Websocket, WebsocketBuilder } from "../src";
import { describe, test, expect, beforeEach, afterEach } from "vitest";

describe("Testsuite for throwing URL providers during retry", () => {
  // dedicated env var (not PORT) so this file never collides with
  // tests/websocket.test.ts when the whole suite runs in parallel
  const port: number = process.env.URL_PROVIDER_THROW_PORT
    ? parseInt(process.env.URL_PROVIDER_THROW_PORT)
    : 41406;
  const url: string = `ws://localhost:${port}`;
  const testTimeout = 10_000;

  let client: Websocket | undefined;
  let server: WebSocketServer | undefined;

  beforeEach(async () => {
    server = await new Promise<WebSocketServer>((resolve, reject) => {
      const wss = new WebSocketServer({ port });
      wss.on("listening", () => resolve(wss));
      wss.on("error", (err) => reject(err));
    });
  }, testTimeout);

  afterEach(async () => {
    client?.close();
    client = undefined;
    await new Promise<void>((resolve) => {
      if (server === undefined) return resolve();
      server.clients.forEach((c) => c.terminate());
      server.addListener("close", () => resolve());
      server.close();
    });
    server = undefined;
  }, testTimeout);

  test.each([
    {
      kind: "an Error",
      thrown: new Error("token fetch failed"),
      message: "token fetch failed",
    },
    { kind: "a non-Error value", thrown: "token fetch failed", message: "" },
  ])(
    "Websocket should dispatch 'error' carrying the thrown value and keep retrying when the URL provider throws $kind on a retry",
    async ({ thrown, message }) => {
      let providerCalls = 0;
      const urlProvider = () => {
        providerCalls++;
        if (providerCalls === 2) {
          throw thrown;
        }
        return url;
      };

      const errorEvents: Event[] = [];
      const openEvents: number[] = [];

      const secondOpen = new Promise<void>((resolve) => {
        client = new WebsocketBuilder(urlProvider)
          .withBackoff(new ConstantBackoff(50))
          .onError((_, ev) => errorEvents.push(ev))
          .onOpen(() => {
            openEvents.push(providerCalls);
            if (openEvents.length === 2) resolve();
          })
          .build();
      });

      // wait for the initial connection, then kill it server-side
      await new Promise((resolve) => setTimeout(resolve, 200));
      expect(openEvents.length).toBe(1);
      server?.clients.forEach((c) => c.terminate());

      // retry #1 calls the provider a 2nd time -> throws. Before the fix this
      // kills the reconnect chain: no error event, no further provider calls,
      // and the second 'open' never happens.
      await secondOpen;

      expect(providerCalls).toBeGreaterThanOrEqual(3); // 1st ok, 2nd threw, 3rd ok
      // the throwing attempt surfaced as 'error'; native error events (e.g. for
      // the terminated connection) are plain Events, so only it is an ErrorEvent
      const attemptErrors = errorEvents.filter(
        (ev): ev is ErrorEvent => ev instanceof ErrorEvent,
      );
      expect(attemptErrors).toHaveLength(1);
      expect(attemptErrors[0].error).toBe(thrown);
      expect(attemptErrors[0].message).toBe(message);
      expect(client!.readyState).toBe(WebSocket.OPEN);
    },
    testTimeout,
  );
});
