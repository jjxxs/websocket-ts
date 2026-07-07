<div align="center">
<img src="https://raw.githubusercontent.com/jjxxs/websocket-ts/gh-pages/websocket-ts-logo.svg" alt="websocket-ts" width="300" height="65" />
</div>
&nbsp;
<div align="center">
A <b>WebSocket</b> for browsers with <b>auto-reconnect</b> and <b>message buffering</b> written in <b>TypeScript</b>.
</div>
&nbsp;
<div align="center">

[![Build Status](https://img.shields.io/github/actions/workflow/status/jjxxs/websocket-ts/build.yml)](https://github.com/jjxxs/websocket-ts/actions/workflows/build.yml)
[![Test Status](https://img.shields.io/github/actions/workflow/status/jjxxs/websocket-ts/test.yml?label=tests)](https://github.com/jjxxs/websocket-ts/actions/workflows/test.yml)
[![Coverage Status](https://img.shields.io/coveralls/github/jjxxs/websocket-ts/master)](https://coveralls.io/github/jjxxs/websocket-ts?branch=master)
[![npm downloads](https://img.shields.io/npm/dm/websocket-ts.svg)](https://npm-stat.com/charts.html?package=websocket-ts)

</div>

<div align="center">

[![npm version](https://img.shields.io/npm/v/websocket-ts.svg)](https://www.npmjs.org/package/websocket-ts)
[![Bundle Size](https://deno.bundlejs.com/badge?q=websocket-ts)](https://bundlejs.com/?q=websocket-ts)
[![Snyk security](https://snyk.io/test/npm/websocket-ts/badge.svg)](https://snyk.io/test/npm/websocket-ts)
[![License](https://img.shields.io/npm/l/websocket-ts)](LICENSE)

</div>

## Features

- **Lightweight & Standalone**: No dependencies, only a few kB minified & gzipped (see badge).
- **Browser-native**: Utilizes native WebSocket API, offers direct access to the underlying connection.
- **Smart Reconnect**: Optional auto-reconnect and message buffering.
- **Easy Setup**: Optional builder class for quick initialization.
- **Well-Tested**: High test coverage, well-documented for extensibility.
- **Module Support**: Supports CommonJS and ES6 modules.

## Installation

Install `websocket-ts` with npm:

```bash
npm install websocket-ts
```

## Quickstart
This example creates a WebSocket with message buffering and automatic reconnection.
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
This section demonstrates how to use `websocket-ts` in your project using the provided `WebsocketBuilder` class.

For a more detailed description of the API, please refer to the [API Documentation](https://jjxxs.github.io/websocket-ts/).

#### Initialization

Create a new instance with the `WebsocketBuilder`:

```typescript
const ws = new WebsocketBuilder("ws://localhost:42421").build();
```

#### Events

There are seven events you can listen for:

| Event | Description |
|---|---|
| `open` | Connection opened |
| `close` | Connection closed |
| `error` | An error occurred |
| `message` | Message received |
| `retry` | Reconnect attempt |
| `reconnect` | Successful reconnect |
| `exhausted` | Gave up reconnecting after `maxRetries` consecutive failed attempts |

You can use either `WebsocketEvent.open` or the string `"open"` when registering listeners.

The `retry`, `reconnect` and `exhausted` events are `CustomEvent`s whose `detail`
carries the number of retries and the time of the last successful connection.

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
  .onExhausted((i, ev) => console.log("gave up"))
  .build();
```

Listeners accept the options `once` (remove after the first call) and `signal`
(an `AbortSignal`). Aborting the signal removes the listener again, which is
handy for tearing down a group of listeners in one call, e.g. when a component
unmounts:

```typescript
const controller = new AbortController();
ws.addEventListener(WebsocketEvent.message, onMessage, { signal: controller.signal });
ws.addEventListener(WebsocketEvent.close, onClose, { signal: controller.signal });
/* ... on teardown: */
controller.abort(); // removes both listeners
```

#### Remove Event Listeners

To unregister a specific event listener, use `removeEventListener`. Listeners
are matched by function identity; the options they were registered with are
ignored when matching:

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

If the websocket is not connected, the message is stored in the buffer and
sent once the connection is (re-)established — but only if a buffer was
configured (see below). Without a buffer, or after `close()` was called, the
message is silently dropped.

#### Reconnect & Backoff (Optional)

To automatically reconnect after a disconnection, provide a `Backoff` strategy.
This controls the delay between reconnection attempts. There are three built-in `Backoff` implementations, or you can create
your own by implementing the `Backoff` interface. If no backoff is provided, the websocket will not attempt to reconnect.

##### ConstantBackoff

`ConstantBackoff` uses a fixed delay between each reconnection attempt.
To set a constant 1-second wait time, use:

```typescript
const ws = new WebsocketBuilder("ws://localhost:42421")
  .withBackoff(new ConstantBackoff(1000)) // 1000ms = 1s
  .build();
```

#### LinearBackoff

`LinearBackoff` increases the delay between reconnection attempts linearly,
up to an optional maximum. For example, to start with a 0-second delay and increase by
10 seconds for each retry, capping at 60 seconds, use:

```typescript
const ws = new WebsocketBuilder("ws://localhost:42421")
  .withBackoff(new LinearBackoff(0, 10000, 60000)) // 0ms, 10s, 20s, 30s, 40s, 50s, 60s
  .build();
```

##### ExponentialBackoff

`ExponentialBackoff` doubles the delay between each reconnection attempt, up
to a specified maximum. This approach is inspired by the binary exponential backoff algorithm
commonly used in networking. For example, to use a base of 1000ms with a maximum exponent of 6:

```typescript
const ws = new WebsocketBuilder("ws://localhost:42421")
  .withBackoff(new ExponentialBackoff(1000, 6)) // 1s, 2s, 4s, 8s, 16s, 32s, 64s
  .build();
```

##### Retry Limit & Instant Reconnect

Two options refine the retry behavior. Both require a backoff to be
configured — setting them without one throws at construction:

- `withMaxRetries(n)` stops reconnecting after `n` consecutive failed
  attempts. The counter resets on every successful reconnect, so the limit
  applies per outage, not per websocket lifetime. When the limit is reached,
  the `exhausted` event fires.
- `withInstantReconnect(true)` skips the backoff delay for the *first* retry
  of an outage — useful when a dropped connection is usually recoverable
  immediately (e.g. a server restart). Subsequent retries follow the backoff.

```typescript
const ws = new WebsocketBuilder("ws://localhost:42421")
  .withBackoff(new ExponentialBackoff(1000, 6))
  .withMaxRetries(10)          // give up after 10 consecutive failures
  .withInstantReconnect(true)  // first retry of an outage is instant
  .build();
```

##### Giving Up & Resuming

When `maxRetries` is exhausted, the websocket stops retrying and fires the
`exhausted` event. Use `reconnect()` to resume — it resets the retry budget,
resolves the URL (provider) again and connects immediately. It also works on
an open or user-closed websocket, e.g. to force a new connection after an
auth-token rotation or when the browser comes back online:

```typescript
const ws = new WebsocketBuilder("ws://localhost:42421")
  .withBackoff(new ConstantBackoff(1000))
  .withMaxRetries(5)
  .onExhausted(() => showReconnectBanner())
  .build();

reconnectButton.onclick = () => ws.reconnect();
window.addEventListener("online", () => ws.reconnect());
```

#### Buffer (Optional)

To buffer outgoing messages when the websocket is disconnected, provide a `Queue`.
The queue temporarily stores messages and sends them in order when
the websocket (re)connects. Two built-in `Queue` implementations are available, or you can
create your own by implementing the `Queue` interface. If no queue is provided, messages
won't be buffered.

##### RingQueue

`RingQueue` is a fixed-capacity, first-in-first-out (FIFO) queue. When it reaches capacity,
the oldest element is removed to make room for new ones. For instance, to set up a `RingQueue` with a 100-element capacity:

```typescript
const ws = new WebsocketBuilder("ws://localhost:42421")
  .withBuffer(new RingQueue(100))
  .build();
```

##### ArrayQueue

`ArrayQueue` is an unbounded first-in-first-out (FIFO) queue.
To use an `ArrayQueue`:

```typescript
const ws = new WebsocketBuilder("ws://localhost:42421")
  .withBuffer(new ArrayQueue())
  .build();
```

#### URL Provider (Optional)

By default, the URL is a static string. To use a different URL between connection attempts, provide
a function instead. The function is called on each connection attempt, including the initial one and
any retries. This enables use cases like load balancing, auth token rotation, and failover.

```typescript
const ws = new WebsocketBuilder(() => `ws://localhost:42421?token=${getToken()}`)
  .withBackoff(new ConstantBackoff(1000))
  .build();
```

Calling `reconnect()` also re-runs the provider, so a fresh URL (e.g. a new
token) can be forced without waiting for the connection to drop.

## Build & Tests

To compile the project, run `npm run build`.

To run tests, use `npm run test`.
