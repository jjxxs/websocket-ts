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

    test('promise should be released when server send "pong"', async () => {
      await withClientServer(async ({ client, server }) => {
        const promise = client.sendAsync("ping", waitForPong)
        server.send("pong")
        const event = await promise
        expect(event.data).toStrictEqual('pong')
      })
    })

    test('promise should be released only after server send "pong"', async () => {
      await withClientServer(async ({ client, server }) => {
        const seenEvents: MessageEvent[] = []
        const promise = client.sendAsync("ping", (event) => {
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

    test('callback should be cleared after success event', async () => {
      await withClientServer(async ({client, server}) => {
        const promise = client.sendAsync("ping", waitForPong)
        expect(getMessageListeners(client).length).toBe(1) // because we in waiting for "pong" response

        server.send('incorrect response')
        expect(getMessageListeners(client).length).toBe(1) // still waitinig

        server.send('pong')
        await promise

        // no more listeners
        expect(getMessageListeners(client).length).toBe(0)
      })
    })

    test('promise should be rejected, when checking on answer is failed with error', async () => {
      const error = new Error("Some error")

      await withClientServer(async ({client, server}) => {
        const promise = client.sendAsync("hello", () => {
          throw error
        })

        server.send("world")

        expect(promise).rejects.toStrictEqual(error)
      })
    })

    test('when promise rejected, listeners should be cleared', async () => {
      const error = new Error("Some error")

      await withClientServer(async ({client, server}) => {
        expect(getMessageListeners(client).length).toStrictEqual(0)

        const promise = client.sendAsync("hello", () => {
          throw error
        })
        server.send("world")
        expect(promise).rejects.toStrictEqual(error)
        
        expect(getMessageListeners(client).length).toStrictEqual(0)
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