import {
  ArrayQueue,
  ConstantBackoff,
  Websocket,
  WebsocketBuilder,
} from "../src";
import { WebsocketBuffer } from "../src";
import { WebsocketEvent, WebsocketEventListenerOptions } from "../src";
import { vi, describe, test, expect } from "vitest";

describe("Testsuite for WebSocketBuilder", () => {
  const url = "ws://localhost:8080";

  /**
   * build() opens a real connection attempt; close it immediately so tests
   * don't leak connecting/retrying websockets.
   */
  const buildAndClose = (builder: WebsocketBuilder): Websocket => {
    const ws = builder.build();
    ws.close();
    return ws;
  };

  /**
   * Returns the listener-registrations for the given event type, from either
   * a builder or a built websocket. Centralizes the private-state access so
   * only this helper breaks if internals are refactored.
   */
  const registeredListeners = (
    target: WebsocketBuilder | Websocket,
    event: WebsocketEvent,
  ): unknown[] =>
    target instanceof WebsocketBuilder
      ? (target["_options"]?.listeners?.[event] ?? [])
      : target["_options"].listeners[event];

  test("WebsocketBuilder should set url", () => {
    const builder = new WebsocketBuilder(url);
    expect(builder.url).toBe(url);

    const ws = buildAndClose(builder);
    expect(ws.url).toBe(url);
  });

  test("WebsocketBuilder should accept a URL provider function", () => {
    const urlProvider = () => url;
    const builder = new WebsocketBuilder(urlProvider);
    expect(builder.url).toBe(urlProvider);

    const ws = buildAndClose(builder);
    expect(ws.url).toBe(url);
  });

  test("WebsocketBuilder should set protocols", () => {
    const protocols = ["protocol1", "protocol2"];

    const builder = new WebsocketBuilder(url).withProtocols(protocols);
    expect(builder.protocols).toBe(protocols);

    const ws = buildAndClose(builder);
    expect(ws.protocols).toBe(protocols);
  });

  test("WebsocketBuilder should set protocols for subsequent calls", () => {
    const protocols1 = ["protocol1", "protocol2"];
    const protocols2 = ["protocol3", "protocol4"];

    const builder = new WebsocketBuilder(url)
      .withProtocols(protocols1)
      .withProtocols(protocols2);
    expect(builder.protocols).toBe(protocols2);

    const ws = buildAndClose(builder);
    expect(ws.protocols).toBe(protocols2);
  });

  test("WebsocketBuilder should set max-retries", () => {
    const maxRetries = 42;

    const builder = new WebsocketBuilder(url)
      .withBackoff(new ConstantBackoff(1000)) // retry options require a backoff
      .withMaxRetries(maxRetries);
    expect(builder.maxRetries).toBe(maxRetries);

    const ws = buildAndClose(builder);
    expect(ws.maxRetries).toBe(maxRetries);
  });

  test("WebsocketBuilder should set max-retries for subsequent calls", () => {
    const maxRetries1 = 42;
    const maxRetries2 = 1337;

    const builder = new WebsocketBuilder(url)
      .withBackoff(new ConstantBackoff(1000)) // retry options require a backoff
      .withMaxRetries(maxRetries1)
      .withMaxRetries(maxRetries2);
    expect(builder.maxRetries).toBe(maxRetries2);

    const ws = buildAndClose(builder);
    expect(ws.maxRetries).toBe(maxRetries2);
  });

  test("WebsocketBuilder should return undefined for max-retries if not set", () => {
    const builder = new WebsocketBuilder(url);
    expect(builder.maxRetries).toBeUndefined();

    const ws = buildAndClose(builder);
    expect(ws.maxRetries).toBeUndefined();
  });

  test("WebsocketBuilder should set instant-reconnect", () => {
    const instantReconnect = true;

    const builder = new WebsocketBuilder(url)
      .withBackoff(new ConstantBackoff(1000)) // retry options require a backoff
      .withInstantReconnect(instantReconnect);
    expect(builder.instantReconnect).toBe(instantReconnect);

    const ws = buildAndClose(builder);
    expect(ws.instantReconnect).toBe(instantReconnect);
  });

  test("WebsocketBuilder should return undefined for instant-reconnect if not set", () => {
    const builder = new WebsocketBuilder(url);
    expect(builder.instantReconnect).toBeUndefined();

    const ws = buildAndClose(builder);
    expect(ws.instantReconnect).toBeUndefined();
  });

  test("WebsocketBuilder should set backoff", () => {
    const backoff = new ConstantBackoff(42);

    const builder = new WebsocketBuilder(url).withBackoff(backoff);
    expect(builder.backoff).toBe(backoff);

    const ws = buildAndClose(builder);
    expect(ws.backoff).toBe(backoff);
  });

  test("WebsocketBuilder should set backoff for subsequent calls", () => {
    const backoff1 = new ConstantBackoff(42);
    const backoff2 = new ConstantBackoff(1337);

    const builder = new WebsocketBuilder(url)
      .withBackoff(backoff1)
      .withBackoff(backoff2);
    expect(builder.backoff).toBe(backoff2);

    const ws = buildAndClose(builder);
    expect(ws.backoff).toBe(backoff2);
  });

  test("WebsocketBuilder should return undefined for backoff if not set", () => {
    const builder = new WebsocketBuilder(url);
    expect(builder.backoff).toBeUndefined();

    const ws = buildAndClose(builder);
    expect(ws.backoff).toBeUndefined();
  });

  test("WebsocketBuilder should set buffer", () => {
    const buffer: WebsocketBuffer = new ArrayQueue();

    const builder = new WebsocketBuilder(url).withBuffer(buffer);
    expect(builder.buffer).toBe(buffer);

    const ws = buildAndClose(builder);
    expect(ws.buffer).toBe(buffer);
  });

  test("WebsocketBuilder should set buffer for subsequent calls", () => {
    const buffer1: WebsocketBuffer = new ArrayQueue();
    const buffer2: WebsocketBuffer = new ArrayQueue();

    const builder = new WebsocketBuilder(url)
      .withBuffer(buffer1)
      .withBuffer(buffer2);
    expect(builder.buffer).toBe(buffer2);

    const ws = buildAndClose(builder);
    expect(ws.buffer).toBe(buffer2);
  });

  test("WebsocketBuilder should return undefined for buffer if not set", () => {
    const builder = new WebsocketBuilder(url);
    expect(builder.buffer).toBeUndefined();

    const ws = buildAndClose(builder);
    expect(ws.buffer).toBeUndefined();
  });

  describe.each([
    { event: WebsocketEvent.open, method: "onOpen" as const },
    { event: WebsocketEvent.close, method: "onClose" as const },
    { event: WebsocketEvent.error, method: "onError" as const },
    { event: WebsocketEvent.message, method: "onMessage" as const },
    { event: WebsocketEvent.retry, method: "onRetry" as const },
    { event: WebsocketEvent.reconnect, method: "onReconnect" as const },
    { event: WebsocketEvent.exhausted, method: "onExhausted" as const },
  ])("Listener registration for '$event'", ({ event, method }) => {
    /** Registers a listener for this case's event type via the builder method. */
    const register = (
      builder: WebsocketBuilder,
      listener: () => void,
      options?: WebsocketEventListenerOptions,
    ): WebsocketBuilder =>
      (
        builder[method] as (
          l: () => void,
          o?: WebsocketEventListenerOptions,
        ) => WebsocketBuilder
      ).call(builder, listener, options);

    test(`WebsocketBuilder should set '${event}'-listener`, () => {
      const listener = vi.fn();

      const builder = register(new WebsocketBuilder(url), listener);
      expect(registeredListeners(builder, event)).toStrictEqual([
        { listener, options: undefined },
      ]);

      const ws = buildAndClose(builder);
      expect(registeredListeners(ws, event)).toStrictEqual([
        { listener, options: undefined },
      ]);
    });

    test(`WebsocketBuilder should set '${event}'-listener for subsequent calls`, () => {
      const listener1 = vi.fn();
      const listener2 = vi.fn();

      const builder = register(
        register(new WebsocketBuilder(url), listener1),
        listener2,
      );
      expect(registeredListeners(builder, event)).toStrictEqual([
        { listener: listener1, options: undefined },
        { listener: listener2, options: undefined },
      ]);

      const ws = buildAndClose(builder);
      expect(registeredListeners(ws, event)).toStrictEqual([
        { listener: listener1, options: undefined },
        { listener: listener2, options: undefined },
      ]);
    });

    test(`WebsocketBuilder should set '${event}'-listener with options`, () => {
      const listener = vi.fn();
      const options = { once: true };

      const builder = register(new WebsocketBuilder(url), listener, options);
      expect(registeredListeners(builder, event)).toStrictEqual([
        { listener, options },
      ]);

      const ws = buildAndClose(builder);
      expect(registeredListeners(ws, event)).toStrictEqual([
        { listener, options },
      ]);
    });

    test(`WebsocketBuilder should set '${event}'-listener with mixed options`, () => {
      const listener1 = vi.fn();
      const listener2 = vi.fn();
      const options = { once: true };

      const builder = register(
        register(new WebsocketBuilder(url), listener1),
        listener2,
        options,
      );
      expect(registeredListeners(builder, event)).toStrictEqual([
        { listener: listener1, options: undefined },
        { listener: listener2, options },
      ]);

      const ws = buildAndClose(builder);
      expect(registeredListeners(ws, event)).toStrictEqual([
        { listener: listener1, options: undefined },
        { listener: listener2, options },
      ]);
    });
  });

  test("WebsocketBuilder should return a Websocket instance", () => {
    const builder = new WebsocketBuilder(url);
    const ws = buildAndClose(builder);

    expect(ws).toBeInstanceOf(Websocket);
  });

  test("WebsocketBuilder should create new Websocket instances with subsequent 'build' calls", () => {
    const builder = new WebsocketBuilder(url);
    const ws1 = buildAndClose(builder);
    const ws2 = buildAndClose(builder);

    expect(ws1).not.toBe(ws2);
  });
});
