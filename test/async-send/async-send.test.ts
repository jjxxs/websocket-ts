import { Websocket, WebsocketBuilder, WebsocketEvents } from "../../src";
import WS from "jest-websocket-mock";

type ClientServerPair = {
  server: WS
  client: Websocket
}

describe('async-send', () => {
  const url = `ws://localhost:1234`;

  const withClientServer = async (action: (pair: ClientServerPair) => Promise<unknown>) => {
    const server = new WS(url);
    const client = new Websocket(url);
    await server.connected
    
    await action({client, server})

    client.close()
    server.close()
    WS.clean()
  }


  describe('when client send "ping" and wait for "pong"', () => {
    const waitForPong = (event: MessageEvent) => {
      if (event.data === "pong") {
        return true
      }

      return false
    }

    test('promise will be released when server send "pong"', async () => {
      await withClientServer(async ({ client, server }) => {
        const promise = client.asyncSend("ping", waitForPong)
        server.send("pong")
        const event = await promise
        expect(event.data).toStrictEqual('pong')
      })
    })

    test('promise will be released only after server send "pong"', async () => {
      await withClientServer(async ({ client, server }) => {
        const seenEvents: MessageEvent[] = []
        const promise = client.asyncSend("ping", (event) => {
          seenEvents.push(event)

          return waitForPong(event)
        })
        
        server.send("just") 
        server.send("trying")
        server.send("to send")

        server.send("pong")
        const event = await promise

        expect(event.data).toStrictEqual('pong')
        expect(seenEvents.length).toEqual(4)
      })      
    })

    test('callback will be cleared after success event', async () => {
      await withClientServer(async ({client, server}) => {
        const promise = client.asyncSend("ping", waitForPong)
        expect(getMessageListeners(client).length).toBe(1) // because we in waiting for "pong" response

        server.send('incorrect response')
        expect(getMessageListeners(client).length).toBe(1) // still waitinig

        server.send('pong')
        await promise

        // no more listeners
        expect(getMessageListeners(client).length).toBe(0)
      })
    })
  })

  const getMessageListeners = (client: Websocket) => {
    // @ts-ignore abstraction leaked here, but only for tests
    return client.eventListeners['message']
  }
})

function delay(ms: number): Promise<void> {
  return new Promise<void>(resolve => {
      setTimeout(() => {
          resolve();
      }, ms);
  })
}