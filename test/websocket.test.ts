import {Websocket, WebsocketBuilder, WebsocketEvents} from "../src";
import {Server} from "ws";

describe("Testsuite for Websocket", () => {
    const port = 42421;
    const url = `ws://localhost:${port}`;

    let ws: Websocket | undefined;
    let wss: Server | undefined;

    type WsInstanceWithEvent<K extends Event> = { instance: Websocket, event: K };

    beforeEach(async () => {
        await startServer(port).then(server => {
            wss = server;
        });
    });

    afterEach(async () => {
        if (ws !== undefined)
            await shutdownClientOrTimeout(ws, 100);
        if (wss !== undefined)
            await shutdownServerOrTimeout(wss, 100);
    });

    test("Websocket should fire onOpen-event when connection is established", async () => {
        await new Promise<WsInstanceWithEvent<Event>>(resolve => {
            ws = new WebsocketBuilder(url).onOpen((instance, event) => {
                resolve({instance, event});
            }).build();
        }).then(e => {
            expect(e.instance).toBe(ws);
            expect(e.event.type).toBe(WebsocketEvents.open);
            expect(e.instance.underlyingWebsocket?.readyState).toBe(WebSocket.OPEN);
        });
    });

    test("Websocket should fire onClose-event when the server closes the connection", async () => {
        await new Promise<WsInstanceWithEvent<CloseEvent>>(resolve => {
            ws = new WebsocketBuilder(url)
                .onClose((instance, event) => {
                    resolve({instance, event});
                }).build();
            wss?.close(); // close server
        }).then(e => {
            expect(e.instance).toBe(ws);
            expect(e.event.type).toBe(WebsocketEvents.close);
            expect(e.instance.underlyingWebsocket?.readyState).toBe(WebSocket.CLOSED);
        });
    });

    test("Websocket should fire onClose-event when the client closes the connection", async () => {
        const closeCode = 1000;
        const closeReason = "client closed the connection";

        await new Promise<WsInstanceWithEvent<CloseEvent>>(resolve => {
            ws = new WebsocketBuilder(url)
                .onOpen((instance, _) => {
                    instance.close(closeCode, closeReason); // close client
                })
                .onClose((instance, event) => {
                    resolve({instance, event});
                }).build();
        }).then(e => {
            expect(e.instance).toBe(ws);
            expect(e.event.type).toBe(WebsocketEvents.close);
            expect(e.event.code).toBe(closeCode);
            expect(e.event.reason).toBe(closeReason);
            expect(e.instance.underlyingWebsocket?.readyState).toBe(WebSocket.CLOSED);
        });
    });

    test("Websocket should fire onError-event when the server refuses the connection", async () => {
        await new Promise<WsInstanceWithEvent<Event>>(resolve => {
            wss?.close(); // close server
            ws = new WebsocketBuilder(url)
                .onError((instance, event) => {
                    resolve({instance, event});
                }).build();
        }).then(e => {
            expect(e.instance).toBe(ws);
            expect(e.event.type).toBe(WebsocketEvents.error);
            expect(e.instance.underlyingWebsocket?.readyState).toBe(WebSocket.CLOSED);
        });
    });

    test("Websocket should fire onMessage-event when a message is received", async () => {
        const testMessage = "this is a test message.";
        const onMessagePromise = new Promise<WsInstanceWithEvent<MessageEvent>>(resolve => {
            ws = new WebsocketBuilder(url)
                .onMessage((instance, event) => {
                    resolve({instance, event});
                }).build();
        }).then(e => {
            expect(e.instance).toBe(ws);
            expect(e.event.type).toBe(WebsocketEvents.message);
            expect(e.event.data).toBe(testMessage);
            expect(e.instance.underlyingWebsocket?.readyState).toBe(WebSocket.OPEN);
        });

        // wait for the client to connect to the server and then send a message to the client
        if (wss !== undefined) {
            await onClientConnected(wss).then(client => {
                client.send(testMessage);
            })
        }

        // wait for the client to receive the message, it should fire the 'onMessage'-event
        await onMessagePromise;
    });

    test("Websocket should try to reconnect when the connection is lost", async () => {

    });

    test("Websocket should send buffered messages when the connection is (re-)established", async () => {

    });
});

/*describe("TestSuite for Websocket reconnect-function", () => {
    const port = 42421;
    const url = `ws://localhost:${port}`;

    let ws: Websocket | undefined;
    let wss: Server | undefined;
    type wsWithEv<K extends Event> = { instance: Websocket, ev: K };

    test("Websocket reconnect with constant backoff", async () => {
        let retries = 0;
        ws = new Websocket(url, undefined, undefined, new ConstantBackoff(200));
        ws.addEventListener(WebsocketEvents.retry, (_, e) => {
            expect(e.detail.lastBackoff).toBe(200);
        });
        delay(5000).then(() => {
            expect(retries).toBe(6);
        });
    }, 10000);
});*/

function delay(ms: number): Promise<void> {
    return new Promise<void>(resolve => {
        setTimeout(() => {
            resolve();
        }, ms);
    })
}

function startServer(port: number): Promise<Server> {
    return new Promise(resolve => {
        const wss = new Server({port});
        wss.on('listening', () => {
            resolve(wss);
        });
    });
}

function shutdownServerOrTimeout(wss: Server, timeout: number) {
    let timeoutPromise = delay(timeout);
    let shutdownServerPromise = shutdownServer(wss);
    return Promise.race([timeoutPromise, shutdownServerPromise]);
}

function shutdownServer(wss: Server): Promise<void> {
    return new Promise<void>(resolve => {
        wss.addListener("close", () => resolve());
        wss.close();
    });
}

function shutdownClientOrTimeout(ws: Websocket, timeout: number) {
    let timeoutPromise = delay(timeout);
    let shutdownClientPromise = shutdownClient(ws);
    return Promise.race([timeoutPromise, shutdownClientPromise]);
}

function shutdownClient(ws: Websocket): Promise<void> {
    return new Promise<void>(resolve => {
        ws.addEventListener(WebsocketEvents.close, () => resolve());
        ws.close();
    });
}

function onClientConnected(wss: Server): Promise<WebSocket> {
    return new Promise(resolve => {
        wss.on('connection', (client: WebSocket) => {
            resolve(client);
        });
    });
}
