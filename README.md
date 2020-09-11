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