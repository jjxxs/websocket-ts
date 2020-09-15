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
- Optional automatic reconnects
   - With easy-to-configure parameters (time between retries)
- Optional pending-messages
   - With easy-to-configure buffers (size, behaviour)
- Builder-class for easy initialization and configuration

## Usage
New instances can be easily created through the Builder-class.

```typescript
const ws = new Builder('ws://localhost:42421').build();
```

#### Callbacks
You can register callbacks for `onOpen`-, `onClose`-, `onError`- and `onMessage`-events. The callbacks get called with the websocket-instance that caused the event plus the event as parameters.
```typescript
const ws = new Builder('ws://localhost:42421')
    .onOpen((i, e) => { console.log("opened") })
    .onClose((i, e) => { console.log("closed") })
    .onError((i, e) => { console.log("error") })
    .onMessage((i, e) => { i.send(e.data) })
    .build();
```

It is possible to register multiple callbacks for the same event, they are called in stack-order:
```typescript
const ws = new Builder('ws://localhost:42421')
    .onMessage((i, e) => { console.log("sent echo") })
    .onMessage((i, e) => { i.send(e.data) })
    .onMessage((i, e) => { console.log("message received") })
    .build();
```

#### Buffer
To buffer pending messages while your websocket is disconnected, configure it to use a Buffer. These pending messages
 will be sent out as soon as the connection is (re)-established.

```typescript
const ws = new Builder('ws://localhost:42421')
    .withBuffer(new LRUBuffer(100)) // buffers up to 100 messages, substitutes old messages with new ones
    .build();
```

```typescript
const ws = new Builder('ws://localhost:42421')
    .withBuffer(new TimeBuffer(5 * 60 * 1000)) // buffers messages that were written within the last 5 minutes
    .build();
```

#### Reconnect / Backoff
To configure the websocket to automatically reconnect when the connection gets lost, provide it with a Backoff.
The type of backoff provided decides the delay between connection-retries.

```typescript
const ws  = new Builder('ws://localhost:42421')
    .withBackoff(new ConstantBackoff(500)) // Always waits 500 ms between retries
    .build();
```

```typescript
const ws  = new Builder('ws://localhost:42421')
    .withBackoff(new ExponentialBackoff(100)) // Doubles the time between reconnects with every try
    .build();
```