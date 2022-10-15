import { Websocket, WebsocketBuilder, WebsocketEvents } from "../../src";
import WS from "jest-websocket-mock";

describe('async-send', () => {
  const url = `ws://localhost:1234`;

  const server = new WS(url);
  const client = new Websocket(url);

  beforeEach(async () => {
    await server.connected
  });

  afterEach(async () => {
    WS.clean()
  });

  test('when server send needed request, promise will be released with this event', async () => {
    const promise = client.asyncSend("ping", (event) => {
      if (event.data === "pong") {
        return true
      }

      return false
    })
    
    server.send("pong")

    const event = await promise
    expect(event.data).toStrictEqual('pong')
  })
})

