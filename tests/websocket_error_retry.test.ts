import { describe, expect, test, beforeEach, afterEach } from "vitest";
import { ConstantBackoff, Websocket, WebsocketBuilder } from "../src";

class ErrorOnlyWebSocket extends EventTarget {
  public static instances = 0;

  public readonly CONNECTING = 0;
  public readonly OPEN = 1;
  public readonly CLOSING = 2;
  public readonly CLOSED = 3;

  public readyState = this.CONNECTING;
  public binaryType: BinaryType = "blob";
  public bufferedAmount = 0;
  public extensions = "";
  public protocol = "";

  public constructor(public readonly url: string) {
    super();
    ErrorOnlyWebSocket.instances++;
    queueMicrotask(() => this.dispatchEvent(new Event("error")));
  }

  public close(): void {
    this.readyState = this.CLOSED;
  }

  public send(): void {
    /* intentionally left blank */
  }
}

class ErrorThenCloseWebSocket extends EventTarget {
  public static errors = 0;

  public readonly CONNECTING = 0;
  public readonly OPEN = 1;
  public readonly CLOSING = 2;
  public readonly CLOSED = 3;

  public readyState = this.CONNECTING;
  public binaryType: BinaryType = "blob";
  public bufferedAmount = 0;
  public extensions = "";
  public protocol = "";

  public constructor(public readonly url: string) {
    super();
    ErrorThenCloseWebSocket.errors++;
    queueMicrotask(() => this.dispatchEvent(new Event("error")));
    queueMicrotask(() => this.dispatchEvent(new Event("close") as CloseEvent));
  }

  public close(): void {
    this.readyState = this.CLOSED;
  }

  public send(): void {
    /* intentionally left blank */
  }
}

describe("Websocket retries on connect-time failures", () => {
  let originalWebSocket: typeof WebSocket;
  let client: Websocket | undefined;

  beforeEach(() => {
    originalWebSocket = globalThis.WebSocket;
    client = undefined;
  });

  afterEach(() => {
    client?.close();
    client = undefined;
    globalThis.WebSocket = originalWebSocket;
  });

  test("it keeps retrying when the platform only emits errors", async () => {
    globalThis.WebSocket = ErrorOnlyWebSocket as unknown as typeof WebSocket;
    ErrorOnlyWebSocket.instances = 0;

    const originalSetTimeout = globalThis.setTimeout;
    const originalClearTimeout = globalThis.clearTimeout;
    const scheduled: Array<(() => void) | undefined> = [];

    globalThis.setTimeout = ((cb: TimerHandler) => {
      if (typeof cb === "function") {
        scheduled.push(cb as () => void);
      }
      return scheduled.length;
    }) as typeof globalThis.setTimeout;

    globalThis.clearTimeout = ((id?: number | undefined) => {
      if (typeof id === "number") {
        scheduled[id - 1] = undefined;
      }
    }) as typeof globalThis.clearTimeout;

    try {
      client = new WebsocketBuilder("ws://retry-test")
        .withBackoff(new ConstantBackoff(0))
        .build();

      await Promise.resolve();
      await Promise.resolve();

      expect(scheduled.length).toBe(1);
      scheduled.shift()?.();

      await Promise.resolve();
      await Promise.resolve();

      expect(ErrorOnlyWebSocket.instances).toBeGreaterThan(1);
    } finally {
      globalThis.setTimeout = originalSetTimeout;
      globalThis.clearTimeout = originalClearTimeout;
    }
  });

  test("it does not schedule multiple retries while a retry is pending", async () => {
    const originalSetTimeout = globalThis.setTimeout;
    const originalClearTimeout = globalThis.clearTimeout;
    const scheduled: Array<(() => void) | undefined> = [];

    globalThis.setTimeout = ((cb: TimerHandler) => {
      if (typeof cb === "function") {
        scheduled.push(cb as () => void);
      }
      return scheduled.length;
    }) as typeof globalThis.setTimeout;

    globalThis.clearTimeout = ((id?: number | undefined) => {
      if (typeof id === "number") {
        scheduled[id - 1] = undefined;
      }
    }) as typeof globalThis.clearTimeout;

    try {
      globalThis.WebSocket =
        ErrorThenCloseWebSocket as unknown as typeof WebSocket;
      client = new WebsocketBuilder("ws://retry-test")
        .withBackoff(new ConstantBackoff(5))
        .build();

      await Promise.resolve();
      await Promise.resolve();

      expect(scheduled.length).toBe(1);
    } finally {
      globalThis.setTimeout = originalSetTimeout;
      globalThis.clearTimeout = originalClearTimeout;
    }
  });
});
