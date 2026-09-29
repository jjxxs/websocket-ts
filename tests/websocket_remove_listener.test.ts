import { Websocket, WebsocketEvent } from "../src";
import { describe, test, expect, vi } from "vitest";

/**
 * Regression tests for removeEventListener matching semantics.
 *
 * Removal must match on listener identity only, like the native
 * EventTarget: passing an equal-but-fresh options literal (or no
 * options at all) must still remove the listener.
 */
describe("Testsuite for Websocket.removeEventListener", () => {
  // port 41404: no server is needed, the socket never connects
  const url = "ws://localhost:41404";

  const getListeners = (client: Websocket, type: WebsocketEvent) =>
    client["_options"]["listeners"][type];

  test("Listener added with options should be removed with an equal options literal", () => {
    const client = new Websocket(url);
    const listener = vi.fn();

    client.addEventListener(WebsocketEvent.open, listener, { once: true });
    expect(getListeners(client, WebsocketEvent.open)).toHaveLength(1);

    client.removeEventListener(WebsocketEvent.open, listener, { once: true });
    expect(getListeners(client, WebsocketEvent.open)).toHaveLength(0);
  });

  test("Listener added with options should be removed without options", () => {
    const client = new Websocket(url);
    const listener = vi.fn();

    client.addEventListener(WebsocketEvent.open, listener, { once: true });
    expect(getListeners(client, WebsocketEvent.open)).toHaveLength(1);

    client.removeEventListener(WebsocketEvent.open, listener);
    expect(getListeners(client, WebsocketEvent.open)).toHaveLength(0);
  });

  test("Listener added without options should be removed with options", () => {
    const client = new Websocket(url);
    const listener = vi.fn();

    client.addEventListener(WebsocketEvent.message, listener);
    expect(getListeners(client, WebsocketEvent.message)).toHaveLength(1);

    client.removeEventListener(WebsocketEvent.message, listener, {
      once: true,
    });
    expect(getListeners(client, WebsocketEvent.message)).toHaveLength(0);
  });

  test("Removing a listener should remove all its registrations of that type", () => {
    const client = new Websocket(url);
    const listener = vi.fn();

    client.addEventListener(WebsocketEvent.close, listener);
    client.addEventListener(WebsocketEvent.close, listener, { once: true });
    expect(getListeners(client, WebsocketEvent.close)).toHaveLength(2);

    client.removeEventListener(WebsocketEvent.close, listener);
    expect(getListeners(client, WebsocketEvent.close)).toHaveLength(0);
  });

  test("Removing a listener should leave other listeners of the same type intact", () => {
    const client = new Websocket(url);
    const listener1 = vi.fn();
    const listener2 = vi.fn();

    client.addEventListener(WebsocketEvent.open, listener1, { once: true });
    client.addEventListener(WebsocketEvent.open, listener2);
    expect(getListeners(client, WebsocketEvent.open)).toHaveLength(2);

    client.removeEventListener(WebsocketEvent.open, listener1);
    const remaining = getListeners(client, WebsocketEvent.open);
    expect(remaining).toHaveLength(1);
    expect(remaining[0].listener).toBe(listener2);
  });

  test("Removing a listener should not affect listeners of other types", () => {
    const client = new Websocket(url);
    const listener = vi.fn();

    client.addEventListener(WebsocketEvent.open, listener);
    client.addEventListener(WebsocketEvent.close, listener);

    client.removeEventListener(WebsocketEvent.open, listener);
    expect(getListeners(client, WebsocketEvent.open)).toHaveLength(0);
    expect(getListeners(client, WebsocketEvent.close)).toHaveLength(1);
  });
});
