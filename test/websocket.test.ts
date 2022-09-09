import {ConstantBackoff, LRUBuffer, Websocket, WebsocketBuilder, WebsocketEvent} from "../src"
import {Server} from "ws"

describe("Testsuite for Websocket", () => {
    const serverPort = 42421
    const serverUrl = `ws://localhost:${serverPort}`
    const serverTimeout = 100
    const clientTimeout = 100

    let client: Websocket  // the subject under test
    let server: Server  // used to simulate a websocket server that our client connects to

    type WsInstanceWithEvent<K extends Event> = { instance: Websocket, event: K }

    /** Before each test a fresh websocket server is created. */
    beforeEach(async () => await startWsServer(serverPort).then(srv => server = srv))

    /** After each test the client is disconnected and the server is shut down.*/
    afterEach(async () => {
        if (client !== undefined) await stopWsClientOrTimeout(client, clientTimeout)
        if (server !== undefined) await stopWsServerOrTimeout(server, serverTimeout)
    })

    test("Should fire onOpen-event when the connection is established", async () => {
        await new Promise<WsInstanceWithEvent<Event>>(resolve => {
            client = new WebsocketBuilder(serverUrl)
                .onOpen((instance, event) => resolve({instance, event}))
                .build()
        }).then(e => {
            expect(e.instance).toBe(client)
            expect(e.event.type).toBe(WebsocketEvent.open)
            expect(e.instance.underlyingWebsocket?.readyState).toBe(WebSocket.OPEN)
        })
    })

    test("Should fire onClose-event when the server closes the connection", async () => {
        await new Promise<WsInstanceWithEvent<CloseEvent>>(resolve => {
            client = new WebsocketBuilder(serverUrl)
                .onClose((instance, event) => resolve({instance, event})) // we expect the server to close the connection
                .build()

            server?.close() // close server, the client should fire a close-event
        }).then(e => {
            expect(e.instance).toBe(client)
            expect(e.event.type).toBe(WebsocketEvent.close)
            expect(e.instance.underlyingWebsocket?.readyState).toBe(WebSocket.CLOSED)
        })
    })

    test("Should fire onClose-event when the client closes the connection", async () => {
        const closeCode = 1000
        const closeReason = "Client closed the connection. Just testing tho!"

        await new Promise<WsInstanceWithEvent<CloseEvent>>(resolve => {
            client = new WebsocketBuilder(serverUrl)
                .onOpen((instance, _) => instance.close(closeCode, closeReason)) // on open, immediately close the connection with a close-code and close-reason
                .onClose((instance, event) => resolve({instance, event})) // the close-event should be fired
                .build()
        }).then(e => {
            expect(e.instance).toBe(client)
            expect(e.event.type).toBe(WebsocketEvent.close)
            expect(e.event.code).toBe(closeCode)
            expect(e.event.reason).toBe(closeReason)
            expect(e.instance.underlyingWebsocket?.readyState).toBe(WebSocket.CLOSED)
        })
    })

    test("Should fire onError-event when the server refuses the connection", async () => {
        await new Promise<WsInstanceWithEvent<Event>>(resolve => {
            server?.close() // close the server before the client connects

            client = new WebsocketBuilder(serverUrl)
                .onError((instance, event) => resolve({instance, event})) // trying to connect to a closed server should fire an error-event
                .build()
        }).then(e => {
            expect(e.instance).toBe(client)
            expect(e.event.type).toBe(WebsocketEvent.error)
            expect(e.instance.underlyingWebsocket?.readyState).toBe(WebSocket.CLOSED)
        })
    })

    test("Should fire onMessage-event when a message is received", async () => {
        const testMessage = "This is a test message."

        const onMessagePromise = new Promise<WsInstanceWithEvent<MessageEvent>>(resolve => {
            client = new WebsocketBuilder(serverUrl)
                .onMessage((instance, event) => resolve({instance, event}))
                .build()
        }).then(e => {
            expect(e.instance).toBe(client)
            expect(e.event.type).toBe(WebsocketEvent.message)
            expect(e.event.data).toBe(testMessage)
            expect(e.instance.underlyingWebsocket?.readyState).toBe(WebSocket.OPEN)
        })

        await onClientConnected(server).then(client => client.send(testMessage)) // wait for the client to connect and send a message

        await onMessagePromise // wait for the message to be received
    })

    test("Should send message", async () => {
        const testMessage = "This is a test message."

        client = new WebsocketBuilder(serverUrl).onOpen((instance, _) => instance.send(testMessage)).build() // send message as soon as we are connected

        const onReceivePromise = new Promise<string>(resolve => server.on('connection', socket => socket.onmessage = me => resolve(me.data.toString())))
        await onReceivePromise.then(actual => expect(actual).toBe(testMessage)) // wait for the message to be received
    })

    test("Should not send messages when the user closed the connection.", async () => {
        const testMessage = "This is a test message."
        let callsToUnderlyingSend = 0

        await new Promise<void>(resolve => client = new WebsocketBuilder(serverUrl).onOpen((instance, _) => resolve()).build()) // wait for the client to connect

        client.underlyingWebsocket!.send = (_: any) => callsToUnderlyingSend++ // monkey-patch the underlying websocket to count the number of calls to send

        client.close() // close the connection
        expect(client.closedByUser).toBe(true) // the connection should be closed by the user
        client.send(testMessage) // send a message
        expect(callsToUnderlyingSend).toBe(0) // the underlying websocket should not have been called
    })

    test("Should send buffered messages when the connection is (re-)established", async () => {
        const testMessages = ["one", "two", "three"]

        let onOpen: () => void
        let onClose: () => void
        let wsOnOpenPromise = new Promise<void>(resolve => onOpen = resolve)
        const wsOnClosePromise = new Promise<void>(resolve => onClose = resolve)
        client = new WebsocketBuilder(serverUrl)
            .withBuffer(new LRUBuffer<string>(10))
            .withBackoff(new ConstantBackoff(100))
            .onOpen(() => onOpen())
            .onClose(() => onClose())
            .build()

        await wsOnOpenPromise // wait for client to be connected
        if (server !== undefined)  // shutdown the server
            await stopWsServerOrTimeout(server, 100)
        await wsOnClosePromise // wait for client to register the disconnect

        // sending messages while disconnected should be buffered
        expect((client!['buffer'] as LRUBuffer<string>).len()).toBe(0)
        testMessages.forEach(msg => client?.send(msg))
        expect((client!['buffer'] as LRUBuffer<string>).len()).toBe(testMessages.length)

        // re-start the server and create promise for when all messages are received
        let onMessagesReceived: (msg: string[]) => void
        const onMessagesReceivedPromise = new Promise<string[]>(resolve => onMessagesReceived = resolve)
        await startWsServer(serverPort).then(srv => {
            server = srv
            server.on('connection', socket => {
                let buf = [] as string[]
                socket.onmessage = me => {
                    buf.push(me.data.toString())
                    if (buf.length === testMessages.length)
                        onMessagesReceived(buf)
                }
            })
        })

        // wait for the client to re-connect, it should send out all pending messages...
        wsOnOpenPromise = new Promise<void>(resolve => onOpen = resolve)
        await wsOnOpenPromise

        // ...which are then received by the server in correct order...
        await onMessagesReceivedPromise.then(actual => {
            expect(actual).toEqual(testMessages)
        })

        // ...after which the clients message-buffer should be empty again
        expect((client!['buffer'] as LRUBuffer<string>).len()).toBe(0)
    })

    test("Websocket should remove event-listener correctly when removeEventListener() is called", async () => {
        let count = 0
        const openEventListener = () => count++ // increment counter on every connect
        let onOpen: () => void
        let onClose: () => void
        let wsOnOpenPromise = new Promise<void>(resolve => onOpen = resolve)
        const wsOnClosePromise = new Promise<void>(resolve => onClose = resolve)
        client = new WebsocketBuilder(serverUrl)
            .withBackoff(new ConstantBackoff(100))
            .onOpen(() => onOpen())
            .onOpen(openEventListener)
            .onClose(() => onClose())
            .build()
        await wsOnOpenPromise // wait for initial connection
        expect(count).toBe(1) // openEventListener should be called exactly once at this point
        client.removeEventListener(WebsocketEvent.open, openEventListener) // unregister the event-handler
        if (server !== undefined)  // shutdown the server
            await stopWsServerOrTimeout(server, 100)
        await wsOnClosePromise // wait for client to register the disconnect

        // restart the server and wait for the client to connect
        await startWsServer(serverPort).then(srv => server = srv)
        wsOnOpenPromise = new Promise<void>(resolve => onOpen = resolve)
        await wsOnOpenPromise
        expect(count).toBe(1) // count should still be 1, since the incrementing event-handler was unregistered
    })

    test("Websocket should remove event-listeners if they declare the 'once'-property as true", async () => {
        let count = 0
        const openEventListener = () => count++ // increment counter on every connect
        let onOpen: () => void
        let onClose: () => void
        let wsOnOpenPromise = new Promise<void>(resolve => onOpen = resolve)
        const wsOnClosePromise = new Promise<void>(resolve => onClose = resolve)
        client = new WebsocketBuilder(serverUrl)
            .withBackoff(new ConstantBackoff(100))
            .onOpen(() => onOpen())
            .onOpen(openEventListener, {once: true} as AddEventListenerOptions) // declare 'once'-property
            .onClose(() => onClose())
            .build()
        await wsOnOpenPromise // wait for initial connection
        expect(count).toBe(1) // openEventListener should be called exactly once at this point
        if (server !== undefined)  // shutdown the server
            await stopWsServerOrTimeout(server, 100)
        await wsOnClosePromise // wait for client to register the disconnect

        // restart the server and wait for the client to connect
        await startWsServer(serverPort).then(srv => server = srv)
        wsOnOpenPromise = new Promise<void>(resolve => onOpen = resolve)
        await wsOnOpenPromise
        expect(count).toBe(1) // count should still be 1, since the incrementing event-handler was unregistered
    })

    test("Websocket should try to reconnect when the connection is lost", async () => {

    })

    test("Websocket should fire retryEvent when trying to reconnect", async () => {
        let retryCount = 0
        let onOpen: () => void
        let onClose: () => void
        let onRetry: () => void
        let wsOnOpenPromise = new Promise<void>(resolve => onOpen = resolve)
        const wsOnClosePromise = new Promise<void>(resolve => onClose = resolve)
        let wsOnRetryPromise = new Promise<void>(resolve => onRetry = resolve)
        client = new WebsocketBuilder(serverUrl)
            .withBackoff(new ConstantBackoff(100)) // 100ms between retries
            .onOpen(() => onOpen())
            .onClose(() => onClose())
            .onRetry(() => retryCount++)
            .onRetry(() => onRetry())
            .build()
        await wsOnOpenPromise
        if (server !== undefined)  // shutdown the server
            await stopWsServerOrTimeout(server, 100)
        await wsOnClosePromise // wait for client to register the disconnect
        await wsOnRetryPromise // it should retry after 100ms and this will trigger the event
        await delay(450) // after 450 more ms, it should've triggered another 4 times
        expect(retryCount >= 3 || retryCount <= 6).toBeTruthy()
    })
})

/**
 * Creates a promise that resolves after the given amount of milliseconds.
 * @param ms the amount of milliseconds to wait.
 */
const delay = (ms: number): Promise<void> =>
    new Promise<void>(resolve => setTimeout(resolve, ms))

/**
 * Creates a promise that returns a listening websocket-server when it resolves.
 * @param port the port to listen on.
 */
const startWsServer = (port: number): Promise<Server> =>
    new Promise(resolve => {
        const wss = new Server({port})
        wss.on('listening', () => resolve(wss))
    })

/**
 * Creates a promise that resolves when the given server terminated all clients and closed itself.
 * @param wss the websocket-server to close.
 */
const stopWsServer = (wss: Server): Promise<void> =>
    new Promise<void>(resolve => {
        wss.addListener('close', resolve)
        wss.clients.forEach(c => c.terminate())
        wss.close()
    })

/**
 * Creates a promise that resolves when the given server was stopped or when the timeout was reached.
 * @param wss the websocket-server to close.
 * @param timeout the timeout in milliseconds.
 */
const stopWsServerOrTimeout = (wss: Server, timeout: number) =>
    Promise.race([delay(timeout), stopWsServer(wss)])

/**
 * Creates a promise that resolves then the given websocket was closed or when the timeout was reached.
 * @param ws the websocket to close.
 * @param timeout the timeout in milliseconds.
 */
const stopWsClientOrTimeout = (ws: Websocket, timeout: number) =>
    Promise.race([delay(timeout), shutdownWsClient(ws)])

/**
 * Creates a promise that closes the given websocket and resolves when the websocket fires the close-event.
 * @param ws the websocket to close.
 */
const shutdownWsClient = (ws: Websocket): Promise<void> =>
    new Promise<void>(resolve => {
        ws.addEventListener(WebsocketEvent.close, () => resolve())
        ws.close()
    })

/**
 * Creates a promise that returns the WebSocket when a connection is established to the given server.
 * @param wss the websocket-server to wait for a connection on.
 */
const onClientConnected = (wss: Server): Promise<WebSocket> =>
    new Promise(resolve => wss.on('connection', (client: WebSocket) => resolve(client)))
