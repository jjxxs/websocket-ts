import {Websocket, WebsocketEvents, WsBuilder} from "../src";
import {Server} from "ws";
import {ConstantBackoff} from "../src/backoff/constantbackoff";

describe("Testsuite for Websocket events", () => {
    const port = 42421;
    const url = `ws://localhost:${port}`;

    let ws: Websocket | undefined;
    let wss: Server | undefined;
    type wsWithEv<K extends Event> = { instance: Websocket, ev: K };

    beforeEach(async () => {
        if (ws !== undefined) {
            ws.close();
            await delay(100);
        }
        await startServer(port).then(e => {
            wss = e;
        });
    });

    afterEach(() => {
        wss?.close();
        wss = undefined;
    });

    test("Websocket event-onOpen", async () => {
        await new Promise<wsWithEv<Event>>(resolve => {
            ws = new WsBuilder(url).onOpen((instance, ev) => {
                resolve({instance, ev});
            }).build();
        }).then(e => {
            expect(e.instance).toBe(ws);
            expect(e.ev.type).toBe(WebsocketEvents.open);
        });
    });

    test("Websocket event-onClose", async () => {
        await new Promise<wsWithEv<CloseEvent>>(resolve => {
            ws =new WsBuilder(url).onClose((instance, ev) => {
                resolve({instance, ev});
            }).build();
            wss?.close();
        }).then(e => {
            expect(e.instance).toBe(ws);
            expect(e.ev.type).toBe(WebsocketEvents.close);
        });
    });

    test("Websocket event-onError", async () => {
        await new Promise<wsWithEv<Event>>(resolve => {
            wss?.close();
            ws = new WsBuilder(url).onError((instance, ev) => {
                resolve({instance, ev});
            }).build();
        }).then(e => {
            expect(e.instance).toBe(ws);
            expect(e.ev.type).toBe(WebsocketEvents.error);
        });
    });

    test("Websocket event-onMessage", async () => {
        const testMsg = "this is a test-message!";
        const onMessagePromise = new Promise<wsWithEv<MessageEvent>>(resolve => {
            ws = new WsBuilder(url).onMessage((instance, ev) => {
                resolve({instance, ev});
            }).build();
        }).then(e => {
            expect(e.instance).toBe(ws);
            expect(e.ev.type).toBe(WebsocketEvents.message);
            expect(e.ev.data).toBe(testMsg);
        });

        await onConnection(wss).then(e => {
            e.send(testMsg);
        });

        await onMessagePromise;
    });
});

describe("TestSuite for Websocket reconnect-function", () => {
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
});

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

function onConnection(wss?: Server): Promise<WebSocket> {
    return new Promise((resolve, reject) => {
        if (wss === undefined) {
            reject();
        } else {
            wss.on('connection', (socket: WebSocket) => {
                resolve(socket);
            });
        }
    });
}
