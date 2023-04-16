import {Backoff} from "./backoff/backoff";
import {WebsocketBuffer} from "./websocket_buffer";
import {WebsocketEventListeners} from "./websocket_event";

export interface WebsocketOptions {
    /**
     * The Buffer to use.
     */
    readonly buffer?: WebsocketBuffer;

    /**
     * The options for the connection-retry-strategy.
     */
    readonly retry?: WebsocketConnectionRetryOptions;

    /**
     * The initial listeners to add to the websocket.
     */
    readonly listeners?: WebsocketEventListeners;
}

export interface WebsocketConnectionRetryOptions {
    /**
     * The maximum number of retries before giving up. No limit if undefined.
     */
    readonly maxRetries?: number;

    /**
     * Wether to reconnect immediately after a connection has been lost,
     * ignoring the backoff strategy for the first retry.
     */
    readonly instantReconnect?: boolean;

    /**
     * The backoff strategy to use. This is used to determine the delay between connection-retries.
     */
    readonly backoff?: Backoff;
}