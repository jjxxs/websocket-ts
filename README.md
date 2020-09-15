# websocket-ts
A client-websocket written in TypeScript to be used from within browsers with focus on simplicity, reliability and extensibility. It provides convenient features to automatically reconnect and buffer pending messages.

[![Build Status](https://travis-ci.org/jjxxs/websocket-ts.svg?branch=master)](https://travis-ci.org/jjxxs/websocket-ts)
[![Coverage Status](https://coveralls.io/repos/github/jjxxs/websocket-ts/badge.svg?branch=master)](https://coveralls.io/github/jjxxs/websocket-ts?branch=master)
[![Release](https://img.shields.io/github/v/release/jjxxs/websocket-ts)](https://github.com/jjxxs/websocket-ts/releases/latest)
[![License](https://img.shields.io/github/license/jjxxs/websocket-ts)](/LICENSE)

## Features
- Dependency-free & small in size
- Uses the browser-native WebSocket-functionality
   - Copies the event-based WebSocket-API
   - Provides low-level access to the underlying WebSocket if needed
- Optionally automatic reconnect when disconnected
   - With easy-to-configure parameters (time between retries)
- Optionally buffer messages while disconnected
   - With easy-to-configure buffers (size, behaviour)
- Builder-class for easy initialization and configuration

## Usage
New instances can be created with the Builder.

```typescript
const ws = new WsBuilder('ws://localhost:42421').build();
```

#### Callbacks
You can register callbacks for `onOpen`-, `onClose`-, `onError`- and `onMessage`-events. The callbacks get called with the websocket-instance plus the event itself as parameters.
```typescript
const ws = new WsBuilder('ws://localhost:42421')
    .onOpen((ws, e) => { console.log("opened") })
    .onClose((ws, e) => { console.log("closed") })
    .onError((ws, e) => { console.log("error") })
    .onMessage((ws, e) => { ws.send(e.data) })
    .build();
```

It is possible to register multiple callbacks for the same event, they are called in stack-order:
```typescript
const ws = new WsBuilder('ws://localhost:42421')
    .onMessage((ws, e) => { console.log("sent echo") })
    .onMessage((ws, e) => { i.send(e.data) })
    .onMessage((ws, e) => { console.log("message received") })
    .build();
```

#### Buffer
To buffer pending messages while your websocket is disconnected, configure it to use a ```Buffer```. While disconnected,
calls to the `send()`-method will write the message you want to send to the buffer. These pending messages
will be sent out in the order that they were inserted as soon as the connection is (re)-established.

```typescript
// LRUBuffer with a capacity of 1000 messages. If the buffer is full,
// the oldest message will be replaced by the newest and so on.
const ws = new WsBuilder('ws://localhost:42421')
    .withBuffer(new LRUBuffer(1000))
    .build();
```

```typescript
// TimeBuffer keeping all messages from the last five minutes,
// older messages are dropped.
const ws = new WsBuilder('ws://localhost:42421')
    .withBuffer(new TimeBuffer(5 * 60 * 1000))
    .build();
```

#### Reconnect / Backoff
When provided with a ```Backoff```, the websocket will automatically try to reconnect when the connection got lost. The
type of backoff provided dictates the delay between connection-retries in milliseconds.

```typescript
// ConstantBackoff will wait a fixed time between connection-retries.
const ws  = new WsBuilder('ws://localhost:42421')
    .withBackoff(new ConstantBackoff(500))
    .build();
```

```typescript
// ExponentialBackoff will double the time to wait between retries with 
// every unsuccessful retry until a maximum is reached. This one goes from
// 100 * 2^0 to 100 * 2^5, so [100, 200, 400, 800, 1600, 3200] milliseconds.
const ws  = new WsBuilder('ws://localhost:42421')
    .withBackoff(new ExponentialBackoff(100, 0, 5))
    .build();
```