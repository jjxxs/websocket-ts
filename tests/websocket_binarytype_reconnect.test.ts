import { WebSocketServer } from "ws";
import {
  ConstantBackoff,
  Websocket,
  WebsocketBuilder,
  WebsocketEvent,
} from "../src";
import { describe, test, expect, beforeEach, afterEach } from "vitest";

describe("Testsuite for binaryType across reconnects", () => {
  // offset by 10 to never clash with tests/websocket.test.ts, which binds PORT directly
  const port: number = process.env.PORT
    ? parseInt(process.env.PORT) + 10
    : 41412;
  const url: string = `ws://localhost:${port}`;
  const testTimeout: number = 10_000;

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
    if (client !== undefined) {
      client.close();
      client = undefined;
    }
    await new Promise<void>((resolve) => {
      if (server === undefined) return resolve();
      server.clients.forEach((c) => c.terminate());
      server.addListener("close", () => resolve());
      server.close();
      server = undefined;
    });
  }, testTimeout);

  test(
    "binaryType set by the user should survive a reconnect",
    async () => {
      // wait for the initial connection
      await new Promise<void>((resolve) => {
        client = new WebsocketBuilder(url)
          .withBackoff(new ConstantBackoff(0))
          .onOpen(() => resolve(), { once: true })
          .build();
      });

      client!.binaryType = "arraybuffer";
      expect(client!.binaryType).toBe("arraybuffer");

      // force a reconnect by closing the connection server-side
      const reconnected = new Promise<void>((resolve) => {
        client!.addEventListener(WebsocketEvent.open, () => resolve(), {
          once: true,
        });
      });
      server?.clients.forEach((c) => c.close());
      await reconnected;

      // the user-chosen binaryType must still apply to the new socket
      expect(client!.binaryType).toBe("arraybuffer");
    },
    testTimeout,
  );

  test(
    "binaryType should keep the socket default when never set by the user",
    async () => {
      await new Promise<void>((resolve) => {
        client = new WebsocketBuilder(url)
          .withBackoff(new ConstantBackoff(0))
          .onOpen(() => resolve(), { once: true })
          .build();
      });

      const reconnected = new Promise<void>((resolve) => {
        client!.addEventListener(WebsocketEvent.open, () => resolve(), {
          once: true,
        });
      });
      server?.clients.forEach((c) => c.close());
      await reconnected;

      expect(client!.binaryType).toBe("blob");
    },
    testTimeout,
  );
});
