import { WebSocketServer, WebSocket } from "ws";
import {
  ArrayQueue,
  Backoff,
  ConstantBackoff,
  Websocket,
  WebsocketBuilder,
} from "../src";
import {
  WebsocketEvent,
  WebsocketEventListenerParams,
  WebsocketEventListenerWithOptions,
} from "../src";
import { WebsocketBuffer } from "../src";
import {
  describe,
  test,
  expect,
  beforeAll,
  beforeEach,
  afterEach,
} from "vitest";

describe("Testsuite for Websocket", () => {
  const port: number = process.env.PORT ? parseInt(process.env.PORT) : 41337;
  const url: string = process.env.URL ?? `ws://localhost:${port}`;
  const serverTimeout: number = process.env.SERVER_TIMEOUT
    ? parseInt(process.env.SERVER_TIMEOUT)
    : 5_000;
  const clientTimeout: number = process.env.CLIENT_TIMEOUT
    ? parseInt(process.env.CLIENT_TIMEOUT)
    : 5_000;
  const testTimeout: number = process.env.TEST_TIMEOUT
    ? parseInt(process.env.TEST_TIMEOUT)
    : 10_000;

  let client: Websocket | undefined; // subject under test
  let server: WebSocketServer | undefined; // websocket server used for testing

  /** Before all tests, log the test configuration. */
  beforeAll(() =>
    console.log(
      `Testing websocket on ${url}, server timeout: ${serverTimeout}ms, client timeout: ${clientTimeout}ms`,
    ),
  );

  /** Before each test, start a websocket server on the given port. */
  beforeEach(async () => {
    await startServer(port, serverTimeout).then((s) => (server = s));
  }, testTimeout);

  /** After each test, stop the websocket server. */
  afterEach(async () => {
    await stopClient(client, clientTimeout).then(() => (client = undefined));
    await stopServer(server, serverTimeout).then(() => (server = undefined));
  }, testTimeout);

  describe("Getter/setter tests", () => {
    describe("Url", () => {
      test("Websocket should return the correct url", () => {
        const client = new Websocket(url);
        expect(client.url).toBe(url);
      });
    });

    describe("Protocols", () => {
      test("Websocket should return the correct protocols when protocols are a string", () => {
        const protocols = "protocol1";
        const client = new Websocket(url, protocols);
        expect(client.protocols).toEqual(protocols);
      });

      test("Websocket should return the correct protocols when protocols are an array", () => {
        const protocols = ["protocol1", "protocol2"];
        const client = new Websocket(url, protocols);
        expect(client.protocols).toEqual(protocols);
      });

      test("Websocket should return the correct protocols when protocols are undefined", () => {
        const client = new Websocket(url);
        expect(client.protocols).toBeUndefined();
      });
    });

    describe("Buffer", () => {
      test("Websocket should return the correct buffer when buffer is undefined", () => {
        const client = new Websocket(url);
        expect(client.buffer).toBeUndefined();
      });

      test("Websocket should return the correct buffer when buffer is set", () => {
        const buffer: WebsocketBuffer = new ArrayQueue();
        const client = new Websocket(url, undefined, { buffer });
        expect(client.buffer).toBe(buffer);
      });
    });

    describe("MaxRetries", () => {
      test("Websocket should return the correct maxRetries when maxRetries is undefined", () => {
        const client = new Websocket(url);
        expect(client.maxRetries).toBeUndefined();
      });

      test("Websocket should return the correct maxRetries when maxRetries is set", () => {
        const maxRetries = 5;
        const client = new Websocket(url, undefined, { retry: { maxRetries } });
        expect(client.maxRetries).toBe(maxRetries);
      });
    });

    describe("InstantReconnect", () => {
      test("Websocket should return the correct instantReconnect when instantReconnect is undefined", () => {
        const client = new Websocket(url);
        expect(client.instantReconnect).toBeUndefined();
      });

      test("Websocket should return the correct instantReconnect when instantReconnect is set", () => {
        const instantReconnect = true;
        const client = new Websocket(url, undefined, {
          retry: { instantReconnect },
        });
        expect(client.instantReconnect).toBe(instantReconnect);
      });
    });

    describe("Backoff", () => {
      test("Websocket should return the correct backoff when backoff is undefined", () => {
        const client = new Websocket(url);
        expect(client.backoff).toBeUndefined();
      });

      test("Websocket should return the correct backoff when backoff is set", () => {
        const backoff: Backoff = new ConstantBackoff(1000);
        const client = new Websocket(url, undefined, { retry: { backoff } });
        expect(client.backoff).toBe(backoff);
      });
    });

    describe("ClosedByUser", () => {
      test("Websocket should return false after initialization", () => {
        const client = new Websocket(url);
        expect(client.closedByUser).toBe(false);
      });

      test("Websocket should return true after the client closes the connection", async () => {
        await new Promise<WebsocketEventListenerParams<WebsocketEvent.close>>(
          (resolve) => {
            client = new WebsocketBuilder(url)
              .onOpen((instance) => instance.close())
              .onClose((instance, ev) => resolve([instance, ev]))
              .build();
          },
        ).then(([instance, ev]) => {
          expect(instance).toBe(client);
          expect(ev.type).toBe(WebsocketEvent.close);
          expect(instance.closedByUser).toBe(true);
        });
      });

      test("Websocket should return false if the server closes the connection", async () => {
        await new Promise<WebsocketEventListenerParams<WebsocketEvent.close>>(
          (resolve) => {
            client = new WebsocketBuilder(url)
              .onOpen(() => closeServer(server))
              .onClose((instance, ev) => resolve([instance, ev]))
              .build();
          },
        ).then(([instance, ev]) => {
          expect(instance).toBe(client);
          expect(ev.type).toBe(WebsocketEvent.close);
          expect(instance.closedByUser).toBe(false);
        });
      });
    });

    describe("LastConnection", () => {
      test("Websocket should return undefined after initialization", () => {
        const client = new Websocket(url);
        expect(client.lastConnection).toBeUndefined();
      });

      test("Websocket should return the correct date after the client connects to the server", async () => {
        await new Promise<WebsocketEventListenerParams<WebsocketEvent.open>>(
          (resolve) => {
            client = new WebsocketBuilder(url)
              .onOpen((instance, ev) => resolve([instance, ev]))
              .build();
          },
        ).then(([instance, ev]) => {
          expect(instance).toBe(client);
          expect(ev.type).toBe(WebsocketEvent.open);
          expect(instance.lastConnection).not.toBeUndefined();
        });
      });
    });

    describe("UnderlyingWebsocket", () => {
      test("Websocket should return native websocket after initialization", () => {
        const client = new Websocket(url);
        expect(client.underlyingWebsocket).not.toBeUndefined();
        expect(client.underlyingWebsocket).toBeInstanceOf(window.WebSocket);
      });

      test("Websocket should return the underlying websocket after the client connects to the server", async () => {
        await new Promise<WebsocketEventListenerParams<WebsocketEvent.open>>(
          (resolve) => {
            client = new WebsocketBuilder(url)
              .onOpen((instance, ev) => resolve([instance, ev]))
              .build();
          },
        ).then(([instance, ev]) => {
          expect(instance).toBe(client);
          expect(ev.type).toBe(WebsocketEvent.open);
          expect(instance.underlyingWebsocket).not.toBeUndefined();
          expect(instance.underlyingWebsocket).toBeInstanceOf(window.WebSocket);
        });
      });

      test("Websocket should return the underlying websocket after the client closes the connection", async () => {
        await new Promise<WebsocketEventListenerParams<WebsocketEvent.close>>(
          (resolve) => {
            client = new WebsocketBuilder(url)
              .onOpen((instance) => instance.close())
              .onClose((instance, ev) => resolve([instance, ev]))
              .build();
          },
        ).then(([instance, ev]) => {
          expect(instance).toBe(client);
          expect(ev.type).toBe(WebsocketEvent.close);
          expect(instance.underlyingWebsocket).not.toBeUndefined();
          expect(instance.underlyingWebsocket).toBeInstanceOf(window.WebSocket);
          expect(instance.underlyingWebsocket!.readyState).toBe(
            WebSocket.CLOSED,
          );
        });
      });

      test("Websocket should return the underlying websocket after the server closes the connection", async () => {
        await new Promise<WebsocketEventListenerParams<WebsocketEvent.close>>(
          (resolve) => {
            client = new WebsocketBuilder(url)
              .onOpen(() => closeServer(server))
              .onClose((instance, ev) => resolve([instance, ev]))
              .build();
          },
        ).then(([instance, ev]) => {
          expect(instance).toBe(client);
          expect(ev.type).toBe(WebsocketEvent.close);
          expect(instance.underlyingWebsocket).not.toBeUndefined();
          expect(instance.underlyingWebsocket).toBeInstanceOf(window.WebSocket);
          expect(instance.underlyingWebsocket!.readyState).toBe(
            WebSocket.CLOSED,
          );
        });
      });
    });

    describe("ReadyState", () => {
      test("Websocket should return the correct readyState after initialization", () => {
        const client = new Websocket(url);
        expect(client.readyState).toBe(WebSocket.CONNECTING);
      });

      test("Websocket should return the correct readyState after the client connects to the server", async () => {
        await new Promise<WebsocketEventListenerParams<WebsocketEvent.open>>(
          (resolve) => {
            client = new WebsocketBuilder(url)
              .onOpen((instance, ev) => resolve([instance, ev]))
              .build();
          },
        ).then(([instance, ev]) => {
          expect(instance).toBe(client);
          expect(ev.type).toBe(WebsocketEvent.open);
          expect(instance.readyState).toBe(WebSocket.OPEN);
        });
      });

      test("Websocket should return the correct readyState after the client closes the connection", async () => {
        await new Promise<WebsocketEventListenerParams<WebsocketEvent.close>>(
          (resolve) => {
            client = new WebsocketBuilder(url)
              .onOpen((instance) => instance.close())
              .onClose((instance, ev) => resolve([instance, ev]))
              .build();
          },
        ).then(([instance, ev]) => {
          expect(instance).toBe(client);
          expect(ev.type).toBe(WebsocketEvent.close);
          expect(instance.readyState).toBe(WebSocket.CLOSED);
        });
      });
    });

    describe("BufferedAmount", () => {
      test("Websocket should return the correct bufferedAmount after initialization", () => {
        const client = new Websocket(url);
        expect(client.bufferedAmount).toBe(0);
      });
    });

    describe("Extensions", () => {
      test("Websocket should return the correct extensions after initialization", () => {
        const client = new Websocket(url);
        expect(client.extensions).toBe("");
      });
    });

    describe("BinaryType", () => {
      test("Websocket should return the correct binaryType after initialization", () => {
        const client = new Websocket(url);
        expect(client.binaryType).toBe("blob");
      });

      test("Websocket should return the correct binaryType after setting it", () => {
        const client = new Websocket(url);
        client.binaryType = "arraybuffer";
        expect(client.binaryType).toBe("arraybuffer");
      });
    });
  });

  describe("Event tests", () => {
    describe("Open", () => {
      test(
        "Websocket should fire 'open' when connecting to a server and the underlying websocket should be in readyState 'OPEN'",
        async () => {
          await new Promise<WebsocketEventListenerParams<WebsocketEvent.open>>(
            (resolve) => {
              client = new WebsocketBuilder(url)
                .onOpen((instance, ev) => resolve([instance, ev]))
                .build();
            },
          ).then(([instance, ev]) => {
            expect(instance).toBe(client);
            expect(ev.type).toBe(WebsocketEvent.open);
            expect(instance.underlyingWebsocket).not.toBeUndefined();
            expect(instance.underlyingWebsocket!.readyState).toBe(
              WebSocket.OPEN,
            );
          });
        },
        testTimeout,
      );

      test("Websocket should fire 'open' when reconnecting to a server and the underlying websocket should be in readyState 'OPEN'", async () => {
        await new Promise<WebsocketEventListenerParams<WebsocketEvent.open>>(
          (resolve) => {
            client = new WebsocketBuilder(url)
              .withBackoff(new ConstantBackoff(0))
              .onOpen((instance, ev) => resolve([instance, ev]))
              .build();
          },
        ).then(([instance, ev]) => {
          expect(instance).toBe(client);
          expect(ev.type).toBe(WebsocketEvent.open);
          expect(instance.underlyingWebsocket).not.toBeUndefined();
          expect(instance.underlyingWebsocket!.readyState).toBe(WebSocket.OPEN);
        });
      });

      test("Websocket shouldn't fire 'open' when it was removed from the event listeners", async () => {
        let timesOpenFired = 0;
        const onOpen = () => timesOpenFired++;

        const clientConnectionPromise = waitForClientToConnectToServer(
          server,
          clientTimeout,
        );

        await new Promise<WebsocketEventListenerParams<WebsocketEvent.open>>(
          (resolve) => {
            client = new WebsocketBuilder(url)
              .withBackoff(new ConstantBackoff(100)) // try to reconnect after 100ms, 'open' should only fire once
              .onOpen(
                (i, ev) => {
                  timesOpenFired++;
                  resolve([i, ev]);
                },
                { once: true },
              ) // initial 'open' event, should only fire once
              .build();
          },
        );

        // this resolves after the client has connected to the server, disconnect it right after
        await clientConnectionPromise;
        expect(timesOpenFired).toBe(1);
        expect(
          getListenersWithOptions(client, WebsocketEvent.open),
        ).toHaveLength(0); // since the initial listener was a 'once'-listener, this should be empty
        client!.addEventListener(WebsocketEvent.open, onOpen); // add a new listener
        expect(
          getListenersWithOptions(client, WebsocketEvent.open),
        ).toHaveLength(1); // since the initial listener was a 'once'-listener, this should be empty
        server?.clients.forEach((c) => c.close());

        // wait for the client to reconnect after 100ms
        await waitForClientToConnectToServer(server, clientTimeout);
        await new Promise((resolve) => setTimeout(resolve, 100)); // wait some extra time for client-side event to be fired
        expect(timesOpenFired).toBe(2);
        expect(
          getListenersWithOptions(client, WebsocketEvent.open),
        ).toHaveLength(1); // since the initial listener was a 'once'-listener, this should be empty

        // remove the event-listener, disconnect again
        client!.removeEventListener(WebsocketEvent.open, onOpen);
        expect(
          getListenersWithOptions(client, WebsocketEvent.open),
        ).toHaveLength(0);
        server?.clients.forEach((c) => c.close());

        // wait for the client to reconnect after 100ms, 'open' should not fire again and timesOpenFired will still be 2
        await waitForClientToConnectToServer(server, clientTimeout);
        await new Promise((resolve) => setTimeout(resolve, 100));
        expect(timesOpenFired).toBe(2);
      });
    });

    describe("Close", () => {
      test(
        "Websocket should fire 'close' when the server closes the connection and the underlying websocket should be in readyState 'CLOSED'",
        async () => {
          await new Promise<WebsocketEventListenerParams<WebsocketEvent.close>>(
            (resolve) => {
              client = new WebsocketBuilder(url)
                .onOpen(() => closeServer(server))
                .onClose((instance, ev) => resolve([instance, ev]))
                .build();
            },
          ).then(([instance, ev]) => {
            expect(instance).toBe(client);
            expect(ev.type).toBe(WebsocketEvent.close);
            expect(instance.closedByUser).toBe(false);
            expect(instance.underlyingWebsocket).not.toBeUndefined();
            expect(instance.underlyingWebsocket!.readyState).toBe(
              WebSocket.CLOSED,
            );
          });
        },
        testTimeout,
      );

      test("Websocket should fire 'close' when the client closes the connection and the underlying websocket should be in readyState 'CLOSED'", async () => {
        await new Promise<WebsocketEventListenerParams<WebsocketEvent.close>>(
          (resolve) => {
            client = new WebsocketBuilder(url)
              .onOpen((instance) => instance.close())
              .onClose((instance, ev) => resolve([instance, ev]))
              .build();
          },
        ).then(([instance, ev]) => {
          expect(instance).toBe(client);
          expect(ev.type).toBe(WebsocketEvent.close);
          expect(instance.closedByUser).toBe(true);
          expect(instance.underlyingWebsocket).not.toBeUndefined();
          expect(instance.underlyingWebsocket!.readyState).toBe(
            WebSocket.CLOSED,
          );
        });
      });

      test("Websocket should fire 'close' when the server closes the connection with a status code other than 1000 and the underlying websocket should be in readyState 'CLOSED'", async () => {
        await new Promise<WebsocketEventListenerParams<WebsocketEvent.close>>(
          (resolve) => {
            client = new WebsocketBuilder(url)
              .onOpen(() =>
                server?.clients.forEach((client) =>
                  client.close(1001, "CLOSE_GOING_AWAY"),
                ),
              )
              .onClose((instance, ev) => resolve([instance, ev]))
              .build();
          },
        ).then(([instance, ev]) => {
          expect(instance).toBe(client);
          expect(ev.type).toBe(WebsocketEvent.close);
          expect(ev.code).toBe(1001);
          expect(ev.reason).toBe("CLOSE_GOING_AWAY");
          expect(ev.wasClean).toBe(true);
          expect(instance.closedByUser).toBe(false);
          expect(instance.underlyingWebsocket).not.toBeUndefined();
          expect(instance.underlyingWebsocket!.readyState).toBe(
            WebSocket.CLOSED,
          );
        });
      });

      test("Websocket should fire 'close' when the client closes the connection with a status code other than 1000 and the underlying websocket should be in readyState 'CLOSED'", async () => {
        await new Promise<WebsocketEventListenerParams<WebsocketEvent.close>>(
          (resolve) => {
            client = new WebsocketBuilder(url)
              .onOpen((instance) =>
                instance.close(4000, "APPLICATION_IS_SHUTTING_DOWN"),
              )
              .onClose((instance, ev) => resolve([instance, ev]))
              .build();
          },
        ).then(([instance, ev]) => {
          expect(instance).toBe(client);
          expect(ev.type).toBe(WebsocketEvent.close);
          expect(ev.code).toBe(4000);
          expect(ev.reason).toBe("APPLICATION_IS_SHUTTING_DOWN");
          expect(ev.wasClean).toBe(true);
          expect(instance.closedByUser).toBe(true);
          expect(instance.underlyingWebsocket).not.toBeUndefined();
          expect(instance.underlyingWebsocket!.readyState).toBe(
            WebSocket.CLOSED,
          );
        });
      });
    });

    describe("Error", () => {
      test("Websocket should fire 'error' when the server rejects the connection and the underlying websocket should be in readyState 'CLOSED", async () => {
        await stopServer(server, serverTimeout).then(
          () => (server = undefined),
        );
        await new Promise<WebsocketEventListenerParams<WebsocketEvent.error>>(
          (resolve) => {
            client = new WebsocketBuilder(url)
              .onError((instance, ev) => resolve([instance, ev]))
              .build();
          },
        ).then(([instance, ev]) => {
          expect(instance).toBe(client);
          expect(ev.type).toBe(WebsocketEvent.error);
          expect(instance.underlyingWebsocket).not.toBeUndefined();
          expect(instance.underlyingWebsocket!.readyState).toBe(
            WebSocket.CLOSED,
          );
        });
      });
    });

    describe("Message", () => {
      test("Websocket should fire 'message' when the server sends a message", async () => {
        await new Promise<WebsocketEventListenerParams<WebsocketEvent.message>>(
          (resolve) => {
            client = new WebsocketBuilder(url)
              .onOpen(() =>
                server?.clients.forEach((client) => client.send("Hello")),
              )
              .onMessage((instance, ev) => {
                expect(ev.data).toBe("Hello");
                resolve([instance, ev]);
              })
              .build();
          },
        ).then(([instance, ev]) => {
          expect(instance).toBe(client);
          expect(ev.type).toBe(WebsocketEvent.message);
          expect(ev.data).toBe("Hello");
        });
      });
    });

    describe("Retry & Reconnect", () => {
      test("Websocket should not emit 'retry' on the first connection attempt, emit it when retrying and emit 'reconnect' when it reconnects", async () => {
        let [openCount, retryCount, reconnectCount] = [0, 0, 0];
        const onOpen = () => openCount++;
        const onRetry = () => retryCount++;
        const onReconnect = () => reconnectCount++;

        await new Promise<WebsocketEventListenerParams<WebsocketEvent.open>>(
          (resolve) => {
            client = new WebsocketBuilder(url)
              .withBackoff(new ConstantBackoff(0)) // immediately retry
              .onOpen((instance, ev) => resolve([instance, ev]))
              .onOpen(onOpen)
              .onRetry(onRetry)
              .onReconnect(onReconnect)
              .build();
          },
        ).then(([instance, ev]) => {
          expect(instance).toBe(client);
          expect(ev.type).toBe(WebsocketEvent.open);
        });

        // give some time for all handlers to be called
        await new Promise((resolve) => setTimeout(resolve, 100));
        expect(openCount).toBe(1);
        expect(retryCount).toBe(0);
        expect(reconnectCount).toBe(0);

        // disconnect all clients and give some time for the retry to happen
        server?.clients.forEach((client) => client.close());
        await new Promise((resolve) => setTimeout(resolve, 100));

        // ws should have retried & reconnect
        expect(openCount).toBe(2);
        expect(retryCount).toBe(1);
        expect(reconnectCount).toBe(1);
      });
    });
  });

  describe("Reconnect behaviour", () => {
    describe("InstantReconnect", () => {
      test("Websocket should try to reconnect immediately when instantReconnect is true", async () => {
        let [openCount, retryCount, reconnectCount] = [0, 0, 0];
        const onOpen = () => openCount++;
        const onRetry = () => retryCount++;
        const onReconnect = () => reconnectCount++;

        await new Promise<WebsocketEventListenerParams<WebsocketEvent.open>>(
          (resolve) => {
            client = new WebsocketBuilder(url)
              .withBackoff(new ConstantBackoff(1000)) // retry after 1 second
              .withInstantReconnect(true) // reconnect immediately, don't wait for the backoff for the first retry
              .onOpen((instance, ev) => resolve([instance, ev]))
              .onOpen(onOpen)
              .onRetry(onRetry)
              .onReconnect(onReconnect)
              .build();
          },
        ).then(([instance, ev]) => {
          expect(instance).toBe(client);
          expect(ev.type).toBe(WebsocketEvent.open);
        });

        // give some time for all handlers to be called
        await new Promise((resolve) => setTimeout(resolve, 100));
        expect(openCount).toBe(1);
        expect(retryCount).toBe(0);
        expect(reconnectCount).toBe(0);

        // disconnect all clients and give some time for the retry to happen
        server?.clients.forEach((client) => client.close());
        await new Promise((resolve) => setTimeout(resolve, 100));

        // ws should have retried & reconnect
        expect(openCount).toBe(2);
        expect(retryCount).toBe(1);
        expect(reconnectCount).toBe(1);
      });

      test("Websocket should not try to reconnect immediately when instantReconnect is false", async () => {
        let [openCount, retryCount, reconnectCount] = [0, 0, 0];
        const onOpen = () => openCount++;
        const onRetry = () => retryCount++;
        const onReconnect = () => reconnectCount++;

        await new Promise<WebsocketEventListenerParams<WebsocketEvent.open>>(
          (resolve) => {
            client = new WebsocketBuilder(url)
              .withBackoff(new ConstantBackoff(1000)) // retry after 1 second
              .withInstantReconnect(false) // reconnect immediately, don't wait for the backoff for the first retry
              .onOpen((instance, ev) => resolve([instance, ev]))
              .onOpen(onOpen)
              .onRetry(onRetry)
              .onReconnect(onReconnect)
              .build();
          },
        ).then(([instance, ev]) => {
          expect(instance).toBe(client);
          expect(ev.type).toBe(WebsocketEvent.open);
        });

        // give some time for all handlers to be called
        await new Promise((resolve) => setTimeout(resolve, 100));
        expect(openCount).toBe(1);
        expect(retryCount).toBe(0);
        expect(reconnectCount).toBe(0);

        // disconnect all clients and give some time for the retry to happen
        server?.clients.forEach((client) => client.close());
        await new Promise((resolve) => setTimeout(resolve, 100));

        // ws shouldn't have retried & reconnect
        expect(openCount).toBe(1);
        expect(retryCount).toBe(0);
        expect(reconnectCount).toBe(0);

        // give some time for the retry to happen
        await new Promise((resolve) => setTimeout(resolve, 1000));
        expect(openCount).toBe(2);
        expect(retryCount).toBe(1);
        expect(reconnectCount).toBe(1);
      });
    });

    describe("MaxRetries", () => {
      test("Websocket should stop trying to reconnect when maxRetries is reached", async () => {
        let [openCount, retryCount, reconnectCount] = [0, 0, 0];
        const onOpen = () => openCount++;
        const onRetry = () => retryCount++;
        const onReconnect = () => reconnectCount++;

        await new Promise<WebsocketEventListenerParams<WebsocketEvent.open>>(
          (resolve) => {
            client = new WebsocketBuilder(url)
              .withBackoff(new ConstantBackoff(0)) // retry after 1 second
              .withMaxRetries(5) // retry 5 times
              .onOpen((instance, ev) => resolve([instance, ev]))
              .onOpen(onOpen)
              .onRetry(onRetry)
              .onReconnect(onReconnect)
              .build();
          },
        ).then(([instance, ev]) => {
          expect(instance).toBe(client);
          expect(ev.type).toBe(WebsocketEvent.open);
        });

        // give some time for all handlers to be called
        await new Promise((resolve) => setTimeout(resolve, 100));
        expect(openCount).toBe(1);
        expect(retryCount).toBe(0);
        expect(reconnectCount).toBe(0);

        // stop server so that the client can't reconnect
        await stopServer(server, serverTimeout);
        await new Promise((resolve) => setTimeout(resolve, 100));

        // ws should have retried but not reconnect
        expect(openCount).toBe(1);
        expect(retryCount).toBe(5);
        expect(reconnectCount).toBe(0);
      });
    });
  });

  describe("Send", () => {
    test("Websocket should send a message to the server and the server should receive it", async () => {
      const serverReceivedMessage = new Promise<string>((resolve) => {
        server?.on("connection", (client) => {
          client?.on(
            "message",
            onStringMessageReceived((str: string) => {
              resolve(str);
            }),
          );
        });
      });

      await new Promise<WebsocketEventListenerParams<WebsocketEvent.open>>(
        (resolve) => {
          client = new WebsocketBuilder(url)
            .onOpen((instance, ev) => {
              instance.send("Hello");
              resolve([instance, ev]);
            })
            .build();
        },
      ).then(([instance, ev]) => {
        expect(instance).toBe(client);
        expect(ev.type).toBe(WebsocketEvent.open);
        expect(instance.underlyingWebsocket).not.toBeUndefined();
        expect(instance.underlyingWebsocket!.readyState).toBe(WebSocket.OPEN);
      });

      await serverReceivedMessage.then((message) =>
        expect(message).toBe("Hello"),
      );
    });

    test("Websocket should send a message to the server and the server should receive it as a Uint8Array", async () => {
      const serverReceivedMessage = new Promise<Uint8Array>((resolve) => {
        server?.on("connection", (client) => {
          client?.on("message", (message: Uint8Array) => {
            resolve(message);
          });
        });
      });

      await new Promise<WebsocketEventListenerParams<WebsocketEvent.open>>(
        (resolve) => {
          client = new WebsocketBuilder(url)
            .onOpen((instance, ev) => {
              instance.send(new Uint8Array([1, 2, 3]));
              resolve([instance, ev]);
            })
            .build();
        },
      ).then(([instance, ev]) => {
        expect(instance).toBe(client);
        expect(ev.type).toBe(WebsocketEvent.open);
        expect(instance.underlyingWebsocket).not.toBeUndefined();
        expect(instance.underlyingWebsocket!.readyState).toBe(WebSocket.OPEN);
      });

      await serverReceivedMessage.then((message) => {
        expect(Buffer.from(message).equals(Buffer.from([1, 2, 3]))).toBe(true);
      });
    });

    test("Websocket should buffer messages sent before the connection is open and send them when the connection is open", async () => {
      const messagesReceived: string[] = [];
      const serverReceivedMessages = new Promise<string[]>((resolve) => {
        server?.on("connection", (client) => {
          client?.on(
            "message",
            onStringMessageReceived((str: string) => {
              messagesReceived.push(str);
              if (messagesReceived.length === 2) {
                resolve(messagesReceived);
              }
            }),
          );
        });
      });

      await new Promise<WebsocketEventListenerParams<WebsocketEvent.open>>(
        (resolve) => {
          client = new WebsocketBuilder(url)
            .withBuffer(new ArrayQueue())
            .onOpen((instance, ev) => {
              setTimeout(() => {
                instance.send("Hello2");
                resolve([instance, ev]);
              }, 100);
            })
            .build();
          client.send("Hello1"); // This message should be buffered
        },
      ).then(([instance, ev]) => {
        expect(instance).toBe(client);
        expect(ev.type).toBe(WebsocketEvent.open);
        expect(instance.underlyingWebsocket).not.toBeUndefined();
        expect(instance.underlyingWebsocket!.readyState).toBe(WebSocket.OPEN);
      });

      await serverReceivedMessages.then((messages) => {
        expect(messages).toEqual(["Hello1", "Hello2"]);
      });
    });

    test("Websocket send should short circuit if the websocket was closed by user", async () => {
      await new Promise<WebsocketEventListenerParams<WebsocketEvent.open>>(
        (resolve) => {
          client = new WebsocketBuilder(url)
            .onOpen((instance, ev) => resolve([instance, ev]))
            .build();
        },
      ).then(([instance, ev]) => {
        expect(instance).toBe(client);
        expect(ev.type).toBe(WebsocketEvent.open);
        expect(instance.underlyingWebsocket).not.toBeUndefined();
        expect(instance.underlyingWebsocket!.readyState).toBe(WebSocket.OPEN);

        // close the websocket and send a message
        instance.close();
        instance.send("This send should short circuit");
      });
    });
  });
});

/**
 * Creates a promise that will be rejected after the given amount of milliseconds. The error will be a TimeoutError.
 * @param ms the amount of milliseconds to wait before rejecting
 * @param msg an optional message to include in the error
 */
const rejectAfter = (ms: number, msg?: string): Promise<void> =>
  new Promise((_, reject) =>
    setTimeout(
      () => reject(msg ? new Error(`Timeout: ${msg}`) : new Error(`Timeout`)),
      ms,
    ),
  );

/**
 * Stops the given websocket client.
 * @param client the websocket client to stop
 * @param timeout the amount of milliseconds to wait before rejecting
 */
const stopClient = (
  client: Websocket | undefined,
  timeout: number,
): Promise<void> =>
  new Promise<void>((resolve, reject) => {
    if (client === undefined) return resolve();
    if (client.underlyingWebsocket?.readyState === WebSocket.CLOSED)
      return resolve();
    rejectAfter(timeout, "failed to stop client").catch((err) => reject(err));
    client.addEventListener(WebsocketEvent.close, () => resolve(), {
      once: true,
    });
    client.close();
  });

/**
 * Starts a websocket server on the given port.
 * @param port the port to start the server on
 * @param timeout the amount of milliseconds to wait before rejecting
 */
const startServer = (port: number, timeout: number): Promise<WebSocketServer> =>
  new Promise((resolve, reject) => {
    rejectAfter(timeout, "failed to start server").catch((err) => reject(err));
    const wss = new WebSocketServer({ port });
    wss.on("listening", () => resolve(wss));
    wss.on("error", (err) => reject(err));
  });

/**
 * Stops the given websocket server. This will terminate all connections.
 * @param wss the websocket server to stop
 * @param timeout the amount of milliseconds to wait before rejecting
 */
const stopServer = (
  wss: WebSocketServer | undefined,
  timeout: number,
): Promise<void> =>
  new Promise<void>((resolve, reject) => {
    if (wss === undefined) return resolve();
    rejectAfter(timeout, "failed to stop server").catch((err) => reject(err));
    wss.clients.forEach((c) => c.terminate());
    wss.addListener("close", resolve);
    wss.close();
  });

/**
 * Waits for a client to connect to the given websocket server.
 *
 * @param wss the websocket server to wait for a client to connect to
 * @param timeout the amount of milliseconds to wait before rejecting
 */
const waitForClientToConnectToServer = (
  wss: WebSocketServer | undefined,
  timeout: number,
): Promise<WebSocket> =>
  new Promise<WebSocket>((resolve, reject) => {
    if (wss === undefined) return reject(new Error("wss is undefined"));
    rejectAfter(timeout, "failed to wait for client to connect").catch((err) =>
      reject(err),
    );
    wss.on("connection", (client) => resolve(client));
  });

/**
 * Returns the listeners for the given event type on the given websocket client.
 *
 * @param client the websocket client to get the listeners from
 * @param type the event type to get the listeners for
 */
const getListenersWithOptions = <K extends WebsocketEvent>(
  client: Websocket | undefined,
  type: K,
): WebsocketEventListenerWithOptions<K>[] =>
  client === undefined ? [] : (client["_options"]["listeners"][type] ?? []);

/**
 * Converts a websocket message to a string.
 *
 * @param message the message to convert to a string
 * @param isBinary whether the message is binary
 * @returns the message as a string
 */
const wsMessageToString = (
  message: ArrayBuffer | Blob | Buffer | Buffer[],
  isBinary: boolean,
): string => {
  if (isBinary) {
    throw new Error("Unexpected binary message");
  } else if (!(message instanceof Buffer)) {
    throw new Error("Unexpected message type");
  } else return message.toString("utf-8");
};

/**
 * Converts a websocket message to a string and calls the given handler.
 *
 * @param handler the handler to call with the message
 */
const onStringMessageReceived =
  (handler: (str: string) => void) =>
  (message: ArrayBuffer | Blob | Buffer | Buffer[], isBinary: boolean) => {
    handler(wsMessageToString(message, isBinary));
  };

/**
 * Closes the given websocket server and terminates all connections.
 *
 * @param wss the websocket server to close
 */
const closeServer = (wss: WebSocketServer | undefined) => {
  if (wss === undefined) return;
  wss.clients.forEach((client) => client.terminate());
  wss.close();
};
