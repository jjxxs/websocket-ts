<div>
  <div align="center">
    <img src="websocket-ts-logo3-plain.svg" alt="websocket-ts" width="300" height="70" />
  </div>
  <div align="center">
    <img src="websocket-ts-logo4-plain.svg" alt="websocket-ts" width="300" height="70" />
  </div>
  <div align="center">
    which to pick? TODO: TEST CODE EXAMPLES
  </div>
  <p align="center">
    <img src="https://github.com/jjxxs/websocket-ts/actions/workflows/build.yml/badge.svg" alt="Build Status" />
    <img src="https://github.com/jjxxs/websocket-ts/actions/workflows/test.yml/badge.svg" alt="Build Status" />
    <a href="https://coveralls.io/github/jjxxs/websocket-ts?branch=master">
      <img src="https://coveralls.io/repos/github/jjxxs/websocket-ts/badge.svg?branch=master&service=github" alt="Coverage Status" />
    </a>
    <a href="https://github.com/jjxxs/websocket-ts/releases/latest">
      <img src="https://img.shields.io/github/v/release/jjxxs/websocket-ts" alt="Release" />
    </a>
    <a href="/LICENSE">
      <img src="https://img.shields.io/github/license/jjxxs/websocket-ts" alt="License" />
    </a>
  </p>
</div>

<div align="center">
A WebSocket for browsers with auto-reconnect and message buffering written in TypeScript.
</div>

## Features

- **Lightweight & Standalone**: No dependencies.
- **Browser-native**: Utilizes WebSocket API, offers direct access.
- **Smart Reconnect**: Optional auto-reconnect and message buffering.
- **Easy Setup**: Optional builder class for quick initialization.
- **Well-Tested**: High test coverage, well-documented for extensibility.

## Installation

Install `websocket-ts` with npm:

```bash
$ npm install websocket-ts 
```

## Usage
This will demonstrate how to use `websocket-ts` in your project. For a more detailed description of the API, please refer to the [API Documentation](https://jjxxs.github.io/websocket-ts/).

#### Initialization

Create a new instance with the `WebsocketBuilder`:

```typescript
const ws = new WebsocketBuilder('ws://localhost:42421').build();
```

#### Events

There are six events which can be subscribed to through callbacks:

```typescript
export enum WebsocketEvent {
  open = "open",          // Connection opened
  close = "close",        // Connection closed
  error = "error",        // Error-induced closure
  message = "message",    // Message received
  retry = "retry",        // Reconnect attempt
  reconnect = "reconnect" // Successful reconnect
}
```

#### Add Event Listeners
Event listeners receive the websocket instance (`i`) and the triggering event (`ev`) as arguments.

You can add event listeners in two ways:

1. During websocket construction:
    ```typescript
    const ws = new WebsocketBuilder('ws://localhost:42421')
      .onOpen((i, ev) => console.log("opened"))
      .onClose((i, ev) => console.log("closed"))
      .onError((i, ev) => console.log("error"))
      .onMessage((i, ev) => console.log("message"))
      .onRetry((i, ev) => console.log("retry"))
      .onReconnect((i, ev) => console.log("reconnect"))
      .build();
    ```

2. After the websocket was created:
    ```typescript
    let ws: Websocket;
    /* ... */
    ws.addEventListener(WebsocketEvent.Message, closeEventListener);
    ```

#### Remove Event Listeners

To unregister a specific event listener, use `removeEventListener`:

```typescript
let ws: Websocket
/* ... */
ws.removeEventListener(WebsocketEvent.open, openEventListener);
```

This will remove the `openEventListener` from handling the `open` event.

#### Send Message

Use the `send` method to send a message to the server:

```typescript
let ws: Websocket;
/* ... */
ws.send("Hello World!");
```

This will send the message `"Hello World!"` to the server.

#### Reconnect & Backoff

If you want the websocket to automatically try to re-connect when the connection is lost, you can provide it with a `Backoff`.
The websocket will use the `Backoff` to determine how long it should wait between re-tries. There are currently three
`Backoff`-implementations. You can also implement your own by inheriting from the `Backoff`-interface.

##### ConstantBackoff

The `ConstantBackoff` will make the websocket wait a constant time between each connection retry. To use the `ConstantBackoff`
with a wait-time of `1 second`:

```typescript
const ws = new WebsocketBuilder('ws://localhost:42421')
  .withBackoff(new ConstantBackoff(1000)) // 1000ms = 1s
  .build();
```

##### LinearBackoff

The `LinearBackoff` linearly increases the wait-time between connection-retries until an optional maximum is reached.
To use the `LinearBackoff` to initially wait `0 seconds` and increase the wait-time by `1 second` with every retry until
a maximum of `8 seconds` is reached:

```typescript
const ws = new WebsocketBuilder('ws://localhost:42421')
  .withBackoff(new LinearBackoff(0, 1000, 8000))
  .build();
```

##### ExponentialBackoff

The `ExponentialBackoff` doubles the backoff with every retry until a maximum is reached. This is modelled after the binary
exponential-backoff algorithm used in computer-networking. To use the `ExponentialBackoff` that will produce the series
`[100, 200, 400, 800, 1600, 3200, 6400]`:

```typescript
const ws = new WebsocketBuilder('ws://localhost:42421')
  .withBackoff(new ExponentialBackoff(100, 7))
  .build();
```

#### Buffer

If you want to buffer to-be-send messages while the websocket is disconnected, you can provide it with a `Buffer`.
The websocket will use the buffer to temporarily keep your messages and send them in order once the websocket
(re-)connects. There are currently two `Buffer`-implementations. You can also implement your own
by inheriting from the `Buffer`-interface.

##### Lruqueue

The `Lruqueue` keeps the last `n` messages. When the buffer is full, the oldest message in the buffer will be replaced.
It uses an array as a circular-buffer for linear space- and time-requirements. To use the `Lruqueue` with a capacity of `1000`:

```typescript
const ws = new WebsocketBuilder('ws://localhost:42421')
  .withBuffer(new Lruqueue(1000))
  .build();
```

##### TimeBuffer

The `TimeBuffer` will keep all messages that were written within the last `n` milliseconds. It will drop messages that are
older than the specified amount. To use the `TimeBuffer` that keeps messages from the last `5 minutes`:

```typescript
const ws = new WebsocketBuilder('ws://localhost:42421')
  .withBuffer(new TimeBuffer(5 * 60 * 1000))
  .build();
```

#### Build & Tests

To build the project run `npm run build`. All provided components are covered with unit-tests. Run the tests with `npm run test`.
