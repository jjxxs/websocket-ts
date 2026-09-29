import { WebSocketServer } from "ws";
import { Websocket, WebsocketBuilder, WebsocketEvent } from "../src";
import { describe, test, expect, beforeEach, afterEach } from "vitest";

/**
 * Regression tests for listener list mutations performed *during* event
 * dispatch. dispatchEvent used to iterate the live listener array and then
 * replace it wholesale with a rebuilt copy, which silently discarded
 * listeners added during dispatch and resurrected listeners removed during
 * dispatch.
 */
describe("Testsuite for listener mutation during dispatch", () => {
  // dedicated env var (not PORT) so this file never collides with
  // tests/websocket.test.ts when the whole suite runs in parallel
  const port: number = process.env.DISPATCH_MUTATION_PORT
    ? parseInt(process.env.DISPATCH_MUTATION_PORT)
    : 41403;
  const url = `ws://localhost:${port}`;
  const timeout = 5_000;

  let client: Websocket | undefined;
  let server: WebSocketServer | undefined;

  beforeEach(async () => {
    server = await startServer(port, timeout);
  });

  afterEach(async () => {
    await stopClient(client, timeout);
    client = undefined;
    await stopServer(server, timeout);
    server = undefined;
  });

  test("Listener added during dispatch of the same event stays registered and fires on the next event", async () => {
    let otherCount = 0;
    const other = () => otherCount++;

    client = await connectedClient(url, timeout);

    let added = false;
    client.addEventListener(WebsocketEvent.message, (instance) => {
      if (!added) {
        added = true;
        instance.addEventListener(WebsocketEvent.message, other);
      }
    });

    sendToAllClients(server, "msg1");
    await sleep(100);

    // 'other' was added during dispatch: it must be registered afterwards...
    expect(getListeners(client, WebsocketEvent.message)).toContain(other);
    expect(otherCount).toBe(0); // ...but not invoked in the round that added it

    sendToAllClients(server, "msg2");
    await sleep(100);

    expect(otherCount).toBe(1); // fires on the next event
  });

  test("Listener removed during dispatch of the same event stays removed", async () => {
    let otherCount = 0;
    const other = () => otherCount++;

    client = await connectedClient(url, timeout);

    client.addEventListener(WebsocketEvent.message, (instance) => {
      instance.removeEventListener(WebsocketEvent.message, other);
    });
    client.addEventListener(WebsocketEvent.message, other);

    sendToAllClients(server, "msg1");
    await sleep(100);

    // the removal happened before 'other' was reached in this round, so it
    // must not have fired and must be gone from the listener list
    expect(getListeners(client, WebsocketEvent.message)).not.toContain(other);
    expect(otherCount).toBe(0);

    sendToAllClients(server, "msg2");
    await sleep(100);

    expect(otherCount).toBe(0); // stays removed on subsequent events
  });

  test("Once-listener fires exactly once and is removed afterwards", async () => {
    let onceCount = 0;
    let normalCount = 0;
    const onceListener = () => onceCount++;
    const normalListener = () => normalCount++;

    client = await connectedClient(url, timeout);
    client.addEventListener(WebsocketEvent.message, onceListener, {
      once: true,
    });
    client.addEventListener(WebsocketEvent.message, normalListener);

    sendToAllClients(server, "msg1");
    await sleep(100);

    expect(onceCount).toBe(1);
    expect(normalCount).toBe(1);
    expect(getListeners(client, WebsocketEvent.message)).not.toContain(
      onceListener,
    );

    sendToAllClients(server, "msg2");
    await sleep(100);

    expect(onceCount).toBe(1); // once-listener must not fire again
    expect(normalCount).toBe(2); // normal listener keeps firing
  });
});

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

const connectedClient = (url: string, timeout: number): Promise<Websocket> =>
  new Promise((resolve, reject) => {
    setTimeout(
      () => reject(new Error("Timeout: client failed to connect")),
      timeout,
    );
    const ws = new WebsocketBuilder(url)
      .onOpen((instance) => resolve(instance), { once: true })
      .build();
    void ws;
  });

const sendToAllClients = (wss: WebSocketServer | undefined, message: string) =>
  wss?.clients.forEach((c) => c.send(message));

const getListeners = <K extends WebsocketEvent>(
  client: Websocket | undefined,
  type: K,
) =>
  client === undefined
    ? []
    : client["_options"]["listeners"][type].map((l) => l.listener);

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
