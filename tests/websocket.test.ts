import {Server} from "ws"
import {ArrayQueue, Backoff, ConstantBackoff, Websocket, WebsocketBuilder} from "../src"
import {WebsocketEvent, WebsocketEventListenerParams} from "../src/websocket_event";
import {WebsocketBuffer} from "../src/websocket_buffer";

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

    describe("Getter tests", () => {
        describe("Url", () => {
            test("Websocket should return the correct url", () => {
                const client = new Websocket(url)
                expect(client.url).toBe(url)
            })
        })

        describe("Protocols", () => {
            test("Websocket should return the correct protocols when protocols are a string", () => {
                const protocols = "protocol1"
                const client = new Websocket(url, protocols)
                expect(client.protocols).toEqual(protocols)
            })

            test("Websocket should return the correct protocols when protocols are an array", () => {
                const protocols = ["protocol1", "protocol2"]
                const client = new Websocket(url, protocols)
                expect(client.protocols).toEqual(protocols)
            })

            test("Websocket should return the correct protocols when protocols are undefined", () => {
                const client = new Websocket(url)
                expect(client.protocols).toBeUndefined()
            })
        })

        describe("Buffer", () => {
            test("Websocket should return the correct buffer when buffer is undefined", () => {
                const client = new Websocket(url)
                expect(client.buffer).toBeUndefined()
            })

            test("Websocket should return the correct buffer when buffer is set", () => {
                const buffer: WebsocketBuffer = new ArrayQueue()
                const client = new Websocket(url, undefined, {buffer})
                expect(client.buffer).toBe(buffer)
            })
        })

        describe("Backoff", () => {
            test("Websocket should return the correct backoff when backoff is undefined", () => {
                const client = new Websocket(url)
                expect(client.backoff).toBeUndefined()
            })

            test("Websocket should return the correct backoff when backoff is set", () => {
                const backoff: Backoff = new ConstantBackoff(1000)
                const client = new Websocket(url, undefined, {retry: {backoff}})
                expect(client.backoff).toBe(backoff)
            })
        })

        describe("ClosedByUser", () => {
            test("Websocket should return false after initialization", () => {
                const client = new Websocket(url)
                expect(client.closedByUser).toBe(false)
            })

            test("Websocket should return true after the client closes the connection", async () => {
                await new Promise<WebsocketEventListenerParams<WebsocketEvent.close>>(resolve => {
                    client = new WebsocketBuilder(url)
                        .onOpen((instance, ev) => instance.close())
                        .onClose((instance, ev) => resolve([instance, ev]))
                        .build()
                }).then(([instance, ev]) => {
                    expect(instance).toBe(client)
                    expect(ev.type).toBe(WebsocketEvent.close)
                    expect(instance.closedByUser).toBe(true)
                })
            })

            test("Websocket should return false if the server closes the connection", async () => {
                await new Promise<WebsocketEventListenerParams<WebsocketEvent.close>>(resolve => {
                    client = new WebsocketBuilder(url)
                        .onOpen(_ => server!.close())
                        .onClose((instance, ev) => resolve([instance, ev]))
                        .build()
                }).then(([instance, ev]) => {
                    expect(instance).toBe(client)
                    expect(ev.type).toBe(WebsocketEvent.close)
                    expect(instance.closedByUser).toBe(false)
                })
            })
        })

        describe("LastConnection", () => {
            test("Websocket should return undefined after initialization", () => {
                const client = new Websocket(url)
                expect(client.lastConnection).toBeUndefined()
            })

            test("Websocket should return the correct date after the client connects to the server", async () => {
                await new Promise<WebsocketEventListenerParams<WebsocketEvent.open>>(resolve => {
                    client = new WebsocketBuilder(url)
                        .onOpen((instance, ev) => resolve([instance, ev]))
                        .build()
                }).then(([instance, ev]) => {
                    expect(instance).toBe(client)
                    expect(ev.type).toBe(WebsocketEvent.open)
                    expect(instance.lastConnection).not.toBeUndefined()
                })
            })
        })

        describe("UnderlyingWebsocket", () => {
            test("Websocket should return native websocket after initialization", () => {
                const client = new Websocket(url)
                expect(client.underlyingWebsocket).not.toBeUndefined()
                expect(client.underlyingWebsocket).toBeInstanceOf(window.WebSocket)
            })

            test("Websocket should return the underlying websocket after the client connects to the server", async () => {
                await new Promise<WebsocketEventListenerParams<WebsocketEvent.open>>(resolve => {
                    client = new WebsocketBuilder(url)
                        .onOpen((instance, ev) => resolve([instance, ev]))
                        .build()
                }).then(([instance, ev]) => {
                    expect(instance).toBe(client)
                    expect(ev.type).toBe(WebsocketEvent.open)
                    expect(instance.underlyingWebsocket).not.toBeUndefined()
                    expect(instance.underlyingWebsocket).toBeInstanceOf(window.WebSocket)
                })
            })

            test("Websocket should return the underlying websocket after the client closes the connection", async () => {
                await new Promise<WebsocketEventListenerParams<WebsocketEvent.close>>(resolve => {
                    client = new WebsocketBuilder(url)
                        .onOpen((instance, ev) => instance.close())
                        .onClose((instance, ev) => resolve([instance, ev]))
                        .build()
                }).then(([instance, ev]) => {
                    expect(instance).toBe(client)
                    expect(ev.type).toBe(WebsocketEvent.close)
                    expect(instance.underlyingWebsocket).not.toBeUndefined()
                    expect(instance.underlyingWebsocket).toBeInstanceOf(window.WebSocket)
                    expect(instance.underlyingWebsocket!.readyState).toBe(WebSocket.CLOSED)
                })
            })

            test("Websocket should return the underlying websocket after the server closes the connection", async () => {
                await new Promise<WebsocketEventListenerParams<WebsocketEvent.close>>(resolve => {
                    client = new WebsocketBuilder(url)
                        .onOpen(_ => server!.close())
                        .onClose((instance, ev) => resolve([instance, ev]))
                        .build()
                }).then(([instance, ev]) => {
                    expect(instance).toBe(client)
                    expect(ev.type).toBe(WebsocketEvent.close)
                    expect(instance.underlyingWebsocket).not.toBeUndefined()
                    expect(instance.underlyingWebsocket).toBeInstanceOf(window.WebSocket)
                    expect(instance.underlyingWebsocket!.readyState).toBe(WebSocket.CLOSED)
                })
            })
        })
    })

    describe("Event tests", () => {
        test("Websocket should fire 'open' when connecting to a server and the underlying websocket should be in readyState 'OPEN'", async () => {
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

        test("Websocket should fire 'open' when reconnecting to a server and the underlying websocket should be in readyState 'OPEN'", async () => {
            await new Promise<WebsocketEventListenerParams<WebsocketEvent.open>>(resolve => {
                client = new WebsocketBuilder(url)
                    .withBackoff(new ConstantBackoff(0))
                    .onOpen((instance, ev) => resolve([instance, ev]))
                    .build()
            }).then(([instance, ev]) => {
                expect(instance).toBe(client)
                expect(ev.type).toBe(WebsocketEvent.open)
                expect(instance.underlyingWebsocket).not.toBeUndefined()
                expect(instance.underlyingWebsocket!.readyState).toBe(WebSocket.OPEN)
            })
        })

        test("Websocket should fire 'close' when the server closes the connection and the underlying websocket should be in readyState 'CLOSED'", async () => {
            await new Promise<WebsocketEventListenerParams<WebsocketEvent.close>>(resolve => {
                client = new WebsocketBuilder(url)
                    .onOpen(_ => server!.close())
                    .onClose((instance, ev) => resolve([instance, ev]))
                    .build()
            }).then(([instance, ev]) => {
                expect(instance).toBe(client)
                expect(ev.type).toBe(WebsocketEvent.close)
                expect(instance.closedByUser).toBe(false)
                expect(instance.underlyingWebsocket).not.toBeUndefined()
                expect(instance.underlyingWebsocket!.readyState).toBe(WebSocket.CLOSED)
            })
        }, testTimeout)

        test("Websocket should fire 'close' when the client closes the connection and the underlying websocket should be in readyState 'CLOSED'", async () => {
            await new Promise<WebsocketEventListenerParams<WebsocketEvent.close>>(resolve => {
                client = new WebsocketBuilder(url)
                    .onOpen((instance, ev) => instance.close())
                    .onClose((instance, ev) => resolve([instance, ev]))
                    .build()
            }).then(([instance, ev]) => {
                expect(instance).toBe(client)
                expect(ev.type).toBe(WebsocketEvent.close)
                expect(instance.closedByUser).toBe(true)
                expect(instance.underlyingWebsocket).not.toBeUndefined()
                expect(instance.underlyingWebsocket!.readyState).toBe(WebSocket.CLOSED)
            })
        })

        test("Websocket should fire 'close' when the server closes the connection with a status code other than 1000 and the underlying websocket should be in readyState 'CLOSED'", async () => {
            await new Promise<WebsocketEventListenerParams<WebsocketEvent.close>>(resolve => {
                client = new WebsocketBuilder(url)
                    .onOpen(_ => server?.clients.forEach(client => client.close(1001, 'CLOSE_GOING_AWAY')))
                    .onClose((instance, ev) => resolve([instance, ev]))
                    .build()
            }).then(([instance, ev]) => {
                expect(instance).toBe(client)
                expect(ev.type).toBe(WebsocketEvent.close)
                expect(ev.code).toBe(1001)
                expect(ev.reason).toBe('CLOSE_GOING_AWAY')
                expect(ev.wasClean).toBe(true)
                expect(instance.closedByUser).toBe(false)
                expect(instance.underlyingWebsocket).not.toBeUndefined()
                expect(instance.underlyingWebsocket!.readyState).toBe(WebSocket.CLOSED)
            })
        })

        test("Websocket should fire 'close' when the client closes the connection with a status code other than 1000 and the underlying websocket should be in readyState 'CLOSED'", async () => {
            await new Promise<WebsocketEventListenerParams<WebsocketEvent.close>>(resolve => {
                client = new WebsocketBuilder(url)
                    .onOpen((instance, ev) => instance.close(4000, 'APPLICATION_IS_SHUTTING_DOWN'))
                    .onClose((instance, ev) => resolve([instance, ev]))
                    .build()
            }).then(([instance, ev]) => {
                expect(instance).toBe(client)
                expect(ev.type).toBe(WebsocketEvent.close)
                expect(ev.code).toBe(4000)
                expect(ev.reason).toBe('APPLICATION_IS_SHUTTING_DOWN')
                expect(ev.wasClean).toBe(true)
                expect(instance.closedByUser).toBe(true)
                expect(instance.underlyingWebsocket).not.toBeUndefined()
                expect(instance.underlyingWebsocket!.readyState).toBe(WebSocket.CLOSED)
            })
        })

        test("Websocket should fire 'error' when the server rejects the connection and the underlying websocket should be in readyState 'CLOSED", async () => {
            await stopServer(server, serverTimeout).then(() => server = undefined)
            await new Promise<WebsocketEventListenerParams<WebsocketEvent.error>>(resolve => {
                client = new WebsocketBuilder(url)
                    .onError((instance, ev) => resolve([instance, ev]))
                    .build()
            }).then(([instance, ev]) => {
                expect(instance).toBe(client)
                expect(ev.type).toBe(WebsocketEvent.error)
                expect(instance.underlyingWebsocket).not.toBeUndefined()
                expect(instance.underlyingWebsocket!.readyState).toBe(WebSocket.CLOSED)
            })
        })
    })
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