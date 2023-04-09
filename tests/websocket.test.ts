import {Server} from "ws"
import {Websocket, WebsocketBuilder} from "../src"
import {WebsocketEvent, WebsocketEventListenerParams} from "../src/websocket_event";

describe("Testsuite for Websocket", () => {
    const port: number = process.env.PORT ? parseInt(process.env.PORT) : 41337
    const url: string = process.env.URL ?? `ws://localhost:${port}`
    const serverTimeout: number = process.env.SERVER_TIMEOUT ? parseInt(process.env.SERVER_TIMEOUT) : 5_000
    const clientTimeout: number = process.env.CLIENT_TIMEOUT ? parseInt(process.env.CLIENT_TIMEOUT) : 5_000
    const testTimeout: number = process.env.TEST_TIMEOUT ? parseInt(process.env.TEST_TIMEOUT) : 10_000

    let client: Websocket | undefined // subject under test
    let server: Server | undefined // websocket server used for testing

    /** Before all tests, log the test configuration. */
    beforeAll(() => console.log(`Testing websocket on ${url}, server timeout: ${serverTimeout}ms, client timeout: ${clientTimeout}ms`))

    /** Before each test, start a websocket server on the given port. */
    beforeEach(async () => {
        await startServer(port, serverTimeout).then(s => server = s)
    }, testTimeout)

    /** After each test, stop the websocket server. */
    afterEach(async () => {
        await stopClient(client, clientTimeout).then(() => client = undefined)
        await stopServer(server, serverTimeout).then(() => server = undefined)
    }, testTimeout)

    test("Websocket should fire 'open' event when connecting to a server and the underlying websocket should be in readyState 'OPEN'", async () => {
        await new Promise<WebsocketEventListenerParams<WebsocketEvent.open>>(resolve => {
            client = new WebsocketBuilder(url)
                .onOpen((instance, ev) => resolve([instance, ev]))
                .build()
        }).then(([instance, ev]) => {
            expect(instance).toBe(client)
            expect(ev.type).toBe(WebsocketEvent.open)
            expect(instance.underlyingWebsocket).not.toBeUndefined()
            expect(instance.underlyingWebsocket!.readyState).toBe(WebSocket.OPEN)
        })
    }, testTimeout)

    test("Websocket should fire 'close' event when the server closes the connection and the underlying websocket should be in readyState 'CLOSED'", async () => {
        await new Promise<WebsocketEventListenerParams<WebsocketEvent.close>>(resolve => {
            client = new WebsocketBuilder(url)
                .onClose((instance, ev) => resolve([instance, ev]))
                .build()

            server!.close()
        }).then(([instance, ev]) => {
            expect(instance).toBe(client)
            expect(ev.type).toBe(WebsocketEvent.close)
            expect(instance.underlyingWebsocket).not.toBeUndefined()
            expect(instance.underlyingWebsocket!.readyState).toBe(WebSocket.CLOSED)
        })
    }, testTimeout)
})


/**
 * Creates a promise that will be rejected after the given amount of milliseconds. The error will be a TimeoutError.
 * @param ms the amount of milliseconds to wait before rejecting
 * @param msg an optional message to include in the error
 */
const rejectAfter = (ms: number, msg?: string): Promise<void> =>
    new Promise((_, reject) => setTimeout(() => reject(msg ? new Error(`Timeout: ${msg}`) : new Error(`Timeout`)), ms))


/**
 * Stops the given websocket client.
 * @param client the websocket client to stop
 * @param timeout the amount of milliseconds to wait before rejecting
 */
const stopClient = (client: Websocket | undefined, timeout: number): Promise<void> =>
    new Promise<void>((resolve, reject) => {
        if (client === undefined) return resolve()
        if (client.underlyingWebsocket?.readyState === WebSocket.CLOSED) return resolve()
        rejectAfter(timeout, 'failed to stop client').catch(err => reject(err))
        client.addEventListener(WebsocketEvent.close, () => resolve(), {once: true})
        client.close()
    })


/**
 * Starts a websocket server on the given port.
 * @param port the port to start the server on
 * @param timeout the amount of milliseconds to wait before rejecting
 */
const startServer = (port: number, timeout: number): Promise<Server> =>
    new Promise((resolve, reject) => {
        rejectAfter(timeout, 'failed to start server').catch(err => reject(err))
        const wss = new Server({port})
        wss.on('listening', () => resolve(wss))
        wss.on('error', err => reject(err))
    })


/**
 * Stops the given websocket server. This will terminate all connections.
 * @param wss the websocket server to stop
 * @param timeout the amount of milliseconds to wait before rejecting
 */
const stopServer = (wss: Server | undefined, timeout: number): Promise<void> =>
    new Promise<void>((resolve, reject) => {
        if (wss === undefined) return resolve()
        rejectAfter(timeout, 'failed to stop server').catch(err => reject(err))
        wss.clients.forEach(c => c.terminate())
        wss.addListener('close', resolve)
        wss.close()
    })