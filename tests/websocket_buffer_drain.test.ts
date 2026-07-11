import { WebSocketServer } from "ws";
import { ArrayQueue, Websocket, WebsocketBuffer, WebsocketEvent } from "../src";
import { describe, test, expect, beforeEach, afterEach } from "vitest";

/**
 * Regression tests for the buffer-drain loop in Websocket.sendBufferedData:
 * when the socket leaves the OPEN state synchronously during buffer replay
 * (e.g. an 'open'-listener closes the underlying websocket directly), the
 * drain used to read an element and immediately re-add it via send(),
 * cycling forever and hanging the event loop.
 */
describe("Testsuite for Websocket buffer draining", () => {
  // offset from the shared PORT so this file never collides with
  // tests/websocket.test.ts when vitest runs test files in parallel
  const port: number =
    (process.env.PORT ? parseInt(process.env.PORT) : 41337) + 70;
  const url = `ws://localhost:${port}`;

  let server: WebSocketServer | undefined;
  let client: Websocket | undefined;

  beforeEach(async () => {
    server = await new Promise<WebSocketServer>((resolve, reject) => {
      const wss = new WebSocketServer({ port });
      wss.on("listening", () => resolve(wss));
      wss.on("error", (err) => reject(err));
    });
  });

  afterEach(async () => {
    client?.close();
    client = undefined;
    await new Promise<void>((resolve) => {
      if (server === undefined) return resolve();
      server.clients.forEach((c) => c.terminate());
      server.addListener("close", () => resolve());
      server.close();
      server = undefined;
    });
  });

  /**
   * A WebsocketBuffer that fails the test fast instead of letting a
   * read/re-add cycle spin forever: draining two buffered messages must
   * never cause more add() calls than the messages that actually exist.
   */
  class CycleDetectingBuffer implements WebsocketBuffer {
    private readonly queue = new ArrayQueue<string | Blob | BufferSource>();
    public adds = 0;

    add(element: string | Blob | BufferSource): void {
      this.adds++;
      if (this.adds > 10) {
        throw new Error("buffer re-add cycle detected");
      }
      this.queue.add(element);
    }

    read(): string | Blob | BufferSource | undefined {
      return this.queue.read();
    }

    length(): number {
      return this.queue.length();
    }
  }

  test("draining the buffer should not cycle when an 'open'-listener closes the underlying websocket", async () => {
    const buffer = new CycleDetectingBuffer();

    const closeFired = new Promise<void>((resolve) => {
      client = new Websocket(url, undefined, {
        buffer,
        listeners: {
          // registered before the internal drain runs: puts the socket
          // into CLOSING synchronously, while two messages are buffered
          open: [
            {
              listener: (instance) => instance.underlyingWebsocket.close(),
            },
          ],
          close: [{ listener: () => resolve(), options: { once: true } }],
          error: [],
          message: [],
          retry: [],
          reconnect: [],
        },
      });

      // both messages are buffered: the websocket is still CONNECTING
      client.send("Hello1");
      client.send("Hello2");
      expect(buffer.adds).toBe(2);
      expect(buffer.length()).toBe(2);
    });

    // before the fix this never resolves: the drain cycles read/add until
    // the instrumented buffer throws inside the 'open' event handler
    await closeFired;

    // the drain must not have re-added elements, and the undeliverable
    // messages must remain buffered for the next successful connection
    expect(buffer.adds).toBe(2);
    expect(buffer.length()).toBe(2);
  }, 10_000);

  test("messages kept in the buffer should be delivered once a connection succeeds", async () => {
    const received: string[] = [];
    const allReceived = new Promise<string[]>((resolve) => {
      server?.on("connection", (socket) => {
        socket.on("message", (message) => {
          received.push(message.toString());
          if (received.length === 2) resolve(received);
        });
      });
    });

    const buffer = new CycleDetectingBuffer();
    client = new Websocket(url, undefined, { buffer });
    client.send("Hello1");
    client.send("Hello2");

    await allReceived;
    expect(received).toEqual(["Hello1", "Hello2"]);
    expect(buffer.length()).toBe(0);
    expect(client.buffer).toBe(buffer);
    expect(client.readyState).toBe(WebSocket.OPEN);
    expect(buffer.adds).toBe(2);

    // sanity: the close event still works on a regular drain
    const closed = new Promise<void>((resolve) =>
      client?.addEventListener(WebsocketEvent.close, () => resolve(), {
        once: true,
      }),
    );
    client.close();
    await closed;
  }, 10_000);
});
