import {ConstantBackoff, LRUBuffer, Websocket, WebsocketBuilder, WebsocketEvents} from "../src";
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

    test("Websocket should send messages when connected", async () => {
        const testMessage = "this is a test message.";
        const onConnectAndSendPromise = new Promise<void>(resolve => {
            ws = new WebsocketBuilder(url)
                .onOpen((instance, _) => {
                    instance.send(testMessage); // send message as soon as we are connected
                    resolve();
                }).build();
        });
        const onReceivePromise = new Promise<string>(resolve => {
            wss?.on('connection', socket => {
                socket.onmessage = me => {
                    resolve(me.data.toString());
                }
            });
        });

        await onConnectAndSendPromise;  // wait for client to connect and send the message
        await onReceivePromise.then(actual => { // wait for server to receive the message and compare
            expect(actual).toBe(testMessage);
        })
    });

    test("Websocket should ignore send()-calls when the connection was closed by the user", async () => {
        const testMessage = "this is a test message.";
        await new Promise<void>(resolve => { // connect to server
            ws = new WebsocketBuilder(url)
                .onOpen((instance, _) => {
                    resolve();
                }).build();
        });

        // monkey-patch the underlying websockets send()-method, to see if it is still called
        let messagesSent = 0;
        if (ws !== undefined && ws.underlyingWebsocket !== undefined) {
            ws.underlyingWebsocket.send = (_: string | ArrayBufferLike | Blob | ArrayBufferView) => {
                messagesSent++;
            }
        }

        ws?.close(); // close connection from client-side
        expect(ws!['closedByUser']).toBe(true);  // should indicate that the connection was closed by user
        ws?.send(testMessage);
        expect(messagesSent).toBe(0); // should still be 0 since send() was never really called
    });

    test("Websocket should send buffered messages when the connection is (re-)established", async () => {
        const testMessages = ["one", "two", "three"];

        let onOpen: () => void;
        let onClose: () => void;
        let wsOnOpenPromise = new Promise<void>(resolve => onOpen = resolve);
        const wsOnClosePromise = new Promise<void>(resolve => onClose = resolve);
        ws = new WebsocketBuilder(url)
            .withBuffer(new LRUBuffer<string>(10))
            .withBackoff(new ConstantBackoff(100))
            .onOpen(() => onOpen())
            .onClose(() => onClose())
            .build();

        await wsOnOpenPromise; // wait for client to be connected
        if (wss !== undefined)  // shutdown the server
            await shutdownServerOrTimeout(wss, 100);
        await wsOnClosePromise; // wait for client to register the disconnect

        // sending messages while disconnected should be buffered
        expect((ws!['buffer'] as LRUBuffer<string>).len()).toBe(0);
        testMessages.forEach(msg => ws?.send(msg));
        expect((ws!['buffer'] as LRUBuffer<string>).len()).toBe(testMessages.length);

        // re-start the server and create promise for when all messages are received
        let onMessagesReceived: (msg: string[]) => void;
        const onMessagesReceivedPromise = new Promise<string[]>(resolve => onMessagesReceived = resolve);
        await startServer(port).then(server => {
            wss = server;
            wss.on('connection', socket => {
                let buf = [] as string[];
                socket.onmessage = me => {
                    buf.push(me.data.toString());
                    if (buf.length === testMessages.length)
                        onMessagesReceived(buf);
                }
            })
        });

        // wait for the client to re-connect, it should send out all pending messages...
        wsOnOpenPromise = new Promise<void>(resolve => onOpen = resolve);
        await wsOnOpenPromise;

        // ...which are then received by the server in correct order...
        await onMessagesReceivedPromise.then(actual => {
            expect(actual).toEqual(testMessages);
        })

        // ...after which the clients message-buffer should be empty again
        expect((ws!['buffer'] as LRUBuffer<string>).len()).toBe(0);
    });

    test("Websocket should remove event-listener correctly when removeEventListener() is called", async () => {
        let count = 0;
        const openEventListener = () => count++; // increment counter on every connect
        let onOpen: () => void;
        let onClose: () => void;
        let wsOnOpenPromise = new Promise<void>(resolve => onOpen = resolve);
        const wsOnClosePromise = new Promise<void>(resolve => onClose = resolve);
        ws = new WebsocketBuilder(url)
            .withBackoff(new ConstantBackoff(100))
            .onOpen(() => onOpen())
            .onOpen(openEventListener)
            .onClose(() => onClose())
            .build();
        await wsOnOpenPromise; // wait for initial connection
        expect(count).toBe(1); // openEventListener should be called exactly once at this point
        ws.removeEventListener(WebsocketEvents.open, openEventListener); // unregister the event-handler
        if (wss !== undefined)  // shutdown the server
            await shutdownServerOrTimeout(wss, 100);
        await wsOnClosePromise; // wait for client to register the disconnect

        // restart the server and wait for the client to connect
        await startServer(port).then(server => wss = server);
        wsOnOpenPromise = new Promise<void>(resolve => onOpen = resolve);
        await wsOnOpenPromise;
        expect(count).toBe(1); // count should still be 1, since the incrementing event-handler was unregistered
    });

    test("Websocket should remove event-listeners if they declare the 'once'-property as true", async () => {
        let count = 0;
        const openEventListener = () => count++; // increment counter on every connect
        let onOpen: () => void;
        let onClose: () => void;
        let wsOnOpenPromise = new Promise<void>(resolve => onOpen = resolve);
        const wsOnClosePromise = new Promise<void>(resolve => onClose = resolve);
        ws = new WebsocketBuilder(url)
            .withBackoff(new ConstantBackoff(100))
            .onOpen(() => onOpen())
            .onOpen(openEventListener, {once: true} as AddEventListenerOptions) // declare 'once'-property
            .onClose(() => onClose())
            .build();
        await wsOnOpenPromise; // wait for initial connection
        expect(count).toBe(1); // openEventListener should be called exactly once at this point
        if (wss !== undefined)  // shutdown the server
            await shutdownServerOrTimeout(wss, 100);
        await wsOnClosePromise; // wait for client to register the disconnect

        // restart the server and wait for the client to connect
        await startServer(port).then(server => wss = server);
        wsOnOpenPromise = new Promise<void>(resolve => onOpen = resolve);
        await wsOnOpenPromise;
        expect(count).toBe(1); // count should still be 1, since the incrementing event-handler was unregistered
    });

    test("Websocket should try to reconnect when the connection is lost", async () => {

    });

    test("Websocket should fire retryEvent when trying to reconnect", async () => {
        let retryCount = 0;
        let onOpen: () => void;
        let onClose: () => void;
        let onRetry: () => void;
        let wsOnOpenPromise = new Promise<void>(resolve => onOpen = resolve);
        const wsOnClosePromise = new Promise<void>(resolve => onClose = resolve);
        let wsOnRetryPromise = new Promise<void>(resolve => onRetry = resolve);
        ws = new WebsocketBuilder(url)
            .withBackoff(new ConstantBackoff(100)) // 100ms between retries
            .onOpen(() => onOpen())
            .onClose(() => onClose())
            .onRetry(() => retryCount++)
            .onRetry(() => onRetry())
            .build();
        await wsOnOpenPromise;
        if (wss !== undefined)  // shutdown the server
            await shutdownServerOrTimeout(wss, 100);
        await wsOnClosePromise; // wait for client to register the disconnect
        await wsOnRetryPromise; // it should retry after 100ms and this will trigger the event
        await delay(450); // after 450 more ms, it should've triggered another 4 times
        expect(retryCount >= 3 || retryCount <= 6).toBeTruthy();
    });
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