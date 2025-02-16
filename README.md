<div>
  <div align="center">
    <img src="https://raw.githubusercontent.com/jjxxs/websocket-ts/gh-pages/websocket-ts-logo.svg" alt="websocket-ts" width="300" height="65" />
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
A <b>WebSocket</b> for browsers with <b>auto-reconnect</b> and <b>message buffering</b> written in <b>TypeScript</b>.
</div>

## Features

- **Lightweight & Standalone**: No dependencies, 2.1 kB minified & gzipped.
- **Browser-native**: Utilizes WebSocket API, offers direct access.
- **Smart Reconnect**: Optional auto-reconnect and message buffering.
- **Easy Setup**: Optional builder class for quick initialization.
- **Well-Tested**: High test coverage, well-documented for extensibility.
- **Module Support**: Supports CommonJS and ES6 modules.

## Installation

Install `websocket-ts` with npm:

```bash
$ npm install websocket-ts 
```

## Quickstart
This example shows how to use the package, complete with message buffering and automatic reconnection.
The created websocket will echo back any received messages. It will buffer messages when disconnected
and attempt to reconnect every 1 second.

```typescript
import {
  ArrayQueue,
  ConstantBackoff,
  Websocket,
  WebsocketBuilder,
  WebsocketEvent,
} from "websocket-ts";

// Initialize WebSocket with buffering and 1s reconnection delay
const ws = new WebsocketBuilder("ws://localhost:8080")
  .withBuffer(new ArrayQueue())           // buffer messages when disconnected
  .withBackoff(new ConstantBackoff(1000)) // retry every 1s
  .build();

// Function to output & echo received messages
const echoOnMessage = (i: Websocket, ev: MessageEvent) => {
  console.log(`received message: ${ev.data}`);
  i.send(`echo: ${ev.data}`);
};

// Add event listeners
ws.addEventListener(WebsocketEvent.open, () => console.log("opened!"));
ws.addEventListener(WebsocketEvent.close, () => console.log("closed!"));
ws.addEventListener(WebsocketEvent.message, echoOnMessage);
```

## Usage
This will demonstrate how to use `websocket-ts` in your project using the provided `WebsocketBuild`-class.

For a more detailed description of the API, please refer to the [API Documentation](https://jjxxs.github.io/websocket-ts/).

#### Initialization

Create a new instance with the `WebsocketBuilder`:

```typescript
const ws = new WebsocketBuilder("ws://localhost:42421").build();
```

#### Events

There are six events which can be subscribed to through with event listeners:

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

 ```typescript
 const ws = new WebsocketBuilder("ws://localhost:42421")
   .onOpen((i, ev) => console.log("opened"))
   .onClose((i, ev) => console.log("closed"))
   .onError((i, ev) => console.log("error"))
   .onMessage((i, ev) => console.log("message"))
   .onRetry((i, ev) => console.log("retry"))
   .onReconnect((i, ev) => console.log("reconnect"))
   .build();
 ```

#### Remove Event Listeners

To unregister a specific event listener, use `removeEventListener`:

```typescript
let ws: Websocket
/* ... */
ws.removeEventListener(WebsocketEvent.open, openEventListener);
```

#### Send Message

Use the `send` method to send a message to the server:

```typescript
let ws: Websocket;
/* ... */
ws.send("Hello World!");
```

#### Reconnect & Backoff (Optional)

If you'd like the websocket to automatically reconnect upon disconnection, you can optionally provide a `Backoff` strategy. 
This sets the delay between reconnection attempts. There are three built-in `Backoff` implementations, or you can create 
your own by implementing the `Backoff` interface. If no Backoff is provided, the websocket will not attempt to reconnect.

##### ConstantBackoff

The `ConstantBackoff` strategy enforces a fixed delay between each reconnection attempt. 
To set a constant 1-second wait time, use:

```typescript
const ws = new WebsocketBuilder("ws://localhost:42421")
  .withBackoff(new ConstantBackoff(1000)) // 1000ms = 1s
  .build();
```

##### LinearBackoff

The `LinearBackoff` strategy increases the delay between reconnection attempts linearly,
up to an optional maximum. For example, to start with a 0-second delay and increase by
10 second for each retry, capping at 60 seconds, use:

```typescript
const ws = new WebsocketBuilder("ws://localhost:42421")
  .withBackoff(new LinearBackoff(0, 10000, 60000)) // 0ms, 10s, 20s, 30s, 40s, 50s, 60s
  .build();
```

##### ExponentialBackoff

The `ExponentialBackoff` strategy doubles the delay between each reconnection attempt, up
to a specified maximum. This approach is inspired by the binary exponential backoff algorithm
commonly used in networking. For example, to generate a backoff series like `[1s, 2s, 4s, 8s]`, use:

```typescript
const ws = new WebsocketBuilder("ws://localhost:42421")
  .withBackoff(new ExponentialBackoff(1000, 6)) // 1s, 2s, 4s, 8s, 16s, 32s, 64s
  .build();
```

#### Buffer (Optional)

To buffer outgoing messages when the websocket is disconnected, you can optionally specify
a `Queue`. This queue will temporarily store your messages and send them in sequence when
the websocket (re)connects. Two built-in `Queue` implementations are available, or you can
create your own by implementing the `Queue` interface. If no queue is provided, messages 
won't be buffered.

##### RingQueue

The `RingQueue` is a fixed-capacity, first-in-first-out (FIFO) queue. When it reaches capacity, 
the oldest element is removed to accommodate new ones. Reading from the queue returns and
removes the oldest element. For instance, to set up a `RingQueue` with a 100-element capacity,
use:

```typescript
const ws = new WebsocketBuilder("ws://localhost:42421")
  .withBuffer(new RingQueue(100))
  .build();
```

##### ArrayQueue

The ArrayQueue offers an unbounded capacity, functioning as a first-in-first-out (FIFO) queue. 
Reading from this queue returns and removes the oldest element. To use an `ArrayQueue`, use:

```typescript
const ws = new WebsocketBuilder("ws://localhost:42421")
  .withBuffer(new ArrayQueue())
  .build();
```

## Build & Tests

To compile the project, execute `npm run build`. 

To run tests, use `npm run test`.