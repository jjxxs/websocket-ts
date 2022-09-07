import {Backoff} from "./backoff/backoff";
import {Buffer} from "./buffer/buffer";

/**
 * Possible events that can be emitted by the websocket.
 */
export enum WebsocketEvent {
    /** Fired when the connection is opened. */
    open = 'open',

    /** Fired when the connection is closed. */
    close = 'close',

    /** Fired when the connection has been closed because of an error, such as when some data couldn't be sent. */
    error = 'error',

    /** Fired when data is received. */
    message = 'message',

    /** A try to re-connect was made. Not part of the WebSocket-standard but specific to this implementation. */
    retry = 'retry'
}

/***
 * Details of the retry-event.
 */
export interface RetryEventDetails {
    /** How many retries have been made so far, including this one. */
    readonly retries: number;

    /** The backoff-time used for this retry-attempt. */
    readonly backoff: number;
}

/**
 * Maps websocket events to their corresponding event-type.
 */
interface WebsocketEventMap {
    open: Event;
    close: CloseEvent;
    error: Event;
    message: MessageEvent;
    retry: CustomEvent<RetryEventDetails>;
}

/**
 * Listener/callback for websocket events.
 * */
export type wsEventListener<K extends WebsocketEvent> =
    (instance: Websocket, ev: WebsocketEventMap[K]) => any;

/**
 * Possible event-options.
 */
export type wsEventListenerOptions = boolean | EventListenerOptions;

/**
 * Listener with options for websocket events.
 */
export type wsEventListenerWithOptions<K extends WebsocketEvent> = {
    readonly listener: wsEventListener<K>;
    readonly options?: wsEventListenerOptions;
}

/**
 * Used to store listeners for websocket events.
 */
export type WebsocketEventListeners = {
    open: wsEventListenerWithOptions<WebsocketEvent.open>[];
    close: wsEventListenerWithOptions<WebsocketEvent.close>[];
    error: wsEventListenerWithOptions<WebsocketEvent.error>[];
    message: wsEventListenerWithOptions<WebsocketEvent.message>[];
    retry: wsEventListenerWithOptions<WebsocketEvent.retry>[];
}

/**
 * Buffers data to be sent by the websocket.
 */
export type WebsocketBuffer = Buffer<string | ArrayBufferLike | Blob | ArrayBufferView>;

export class Websocket {
    private readonly url: string; // URL to connect to, e.g. "ws://localhost:8080/websocket", "wss://localhost:8080/websocket"
    private readonly protocols?: string | string[];
    private readonly buffer?: WebsocketBuffer; // optional buffer for messages to send when the websocket is not yet connected
    private readonly backoff?: Backoff; // optional backoff to use when retrying a connection
    private readonly eventListeners: WebsocketEventListeners = {open: [], close: [], error: [], message: [], retry: []};

    private closedByUser: boolean = false; // whether the websocket was closed by the user
    private websocket?: WebSocket; // underlying browser-native websocket
    private retries: number = 0;

    constructor(url: string, protocols?: string | string[], buffer?: WebsocketBuffer, backoff?: Backoff) {
        this.url = url;
        this.protocols = protocols;
        this.buffer = buffer;
        this.backoff = backoff;
        this.tryConnect();
    }

    /***
     * Getter for the underlying websocket.
     */
    get underlyingWebsocket(): WebSocket | undefined {
        return this.websocket;
    }

    /***
     * Sends data over the websocket or queues it for sending if the websocket is not
     * yet connected and a buffer is configured.
     * @param data to send.
     */
    public send(data: string | ArrayBufferLike | Blob | ArrayBufferView): void {
        if (this.closedByUser) return // no-op when closed by user

        if (this.websocket !== undefined && this.websocket.readyState === this.websocket.OPEN) {
            this.websocket.send(data) // connection is open, send directly
        } else if (this.buffer !== undefined) {
            this.buffer.write([data]) // buffer is defined, write to buffer
        }
    }

    /***
     * Closes the websocket.
     * @param code to close with.
     * @param reason to close with.
     */
    public close(code?: number, reason?: string): void {
        this.closedByUser = true; // mark as closed by user

        if (this.websocket !== undefined) {
            this.websocket.close(code, reason); // close websocket with given code and reason
        }
    }

    /**
     * Adds an event listener for the given event-type.
     * @param type of the event to listen for.
     * @param listener to call when the event is fired.
     * @param options to use when adding the listener.
     */
    public addEventListener<K extends WebsocketEvent>(type: K, listener: wsEventListener<K>, options?: wsEventListenerOptions): void {
        const eventListener = {listener, options} as wsEventListenerWithOptions<K>;
        const eventListeners = this.eventListeners[type] as wsEventListenerWithOptions<K>[];
        eventListeners.push(eventListener); // add listener to list of listeners
    }

    /**
     * Removes an event listener for the given event-type.
     * @param type of the event to remove the listener for.
     * @param listener to remove.
     * @param options that were used when the listener was added.
     */
    public removeEventListener<K extends WebsocketEvent>(type: K, listener: wsEventListener<K>, options?: wsEventListenerOptions): void {
        const notListenerToBeRemoved = (l: wsEventListenerWithOptions<K>) =>
            l.listener !== listener && (l.options === undefined || l.options !== options);

        (this.eventListeners[type] as wsEventListenerWithOptions<K>[]) =
            (this.eventListeners[type] as wsEventListenerWithOptions<K>[])
                .filter(notListenerToBeRemoved); // only keep listeners that are not to be removed
    }

    /**
     * Dispatch an event to all listeners of the given event-type.
     * @param type of the event to dispatch.
     * @param event to dispatch.
     * @private - should only be called by the websocket.
     */
    private dispatchEvent<K extends WebsocketEvent>(type: K, event: WebsocketEventMap[K]) {
        const eventListeners = this.eventListeners[type] as wsEventListenerWithOptions<K>[];
        const newEventListeners: wsEventListenerWithOptions<K>[] = [];

        eventListeners.forEach(listener => {
            listener.listener(this, event); // invoke listener with event

            const options = listener.options as AddEventListenerOptions; // possible specialisation of options
            if (options === undefined || options.once === undefined || !options.once) {
                newEventListeners.push(listener); // only keep listener if it isn't a once-listener
            }
        });

        (this.eventListeners[type] as wsEventListenerWithOptions<K>[]) = newEventListeners; // replace old listeners with new that don't include once-listeners
    }

    /**
     * Creates a new browser-native websocket and connects it to the given URL with the given protocols
     * and adds all event listeners to the browser-native websocket.
     * @private - should only be called by the websocket.
     */
    private tryConnect(): void {
        if (this.websocket !== undefined) { // websocket was already created, this is a retry. remove all event listeners, close and start over.
            this.websocket.removeEventListener(WebsocketEvent.open, this.handleOpenEvent);
            this.websocket.removeEventListener(WebsocketEvent.close, this.handleCloseEvent);
            this.websocket.removeEventListener(WebsocketEvent.error, this.handleErrorEvent);
            this.websocket.removeEventListener(WebsocketEvent.message, this.handleMessageEvent);
            this.websocket.close();
        }

        this.websocket = new WebSocket(this.url, this.protocols); // create new browser-native websocket and add all event listeners
        this.websocket.addEventListener(WebsocketEvent.open, this.handleOpenEvent);
        this.websocket.addEventListener(WebsocketEvent.close, this.handleCloseEvent);
        this.websocket.addEventListener(WebsocketEvent.error, this.handleErrorEvent);
        this.websocket.addEventListener(WebsocketEvent.message, this.handleMessageEvent);
    }

    /**
     * Handles the open event of the browser-native websocket.
     * @param event to handle.
     */
    private handleOpenEvent = (event: Event) =>
        this.handleEvent(WebsocketEvent.open, event);

    /**
     * Handles the close event of the browser-native websocket.
     * @param event to handle.
     */
    private handleErrorEvent = (event: Event) =>
        this.handleEvent(WebsocketEvent.error, event);

    /**
     * Handles the close event of the browser-native websocket.
     * @param event to handle.
     */
    private handleCloseEvent = (event: CloseEvent) =>
        this.handleEvent(WebsocketEvent.close, event);

    /**
     * Handles the message event of the browser-native websocket.
     * @param event to handle.
     */
    private handleMessageEvent = (event: MessageEvent) =>
        this.handleEvent(WebsocketEvent.message, event);

    /**
     * Handles the given event by dispatching it to all listeners of the given event-type.
     * @param type of the event to handle.
     * @param ev to handle.
     * @private - should only be called by the websocket.
     */
    private handleEvent<K extends WebsocketEvent>(type: K, ev: WebsocketEventMap[K]) {
        switch (type) {
            case WebsocketEvent.close:
                if (!this.closedByUser) {
                    this.reconnect(); // connection was closed due to server- or connection-issues, try to reconnect
                }
                break;
            case WebsocketEvent.open:
                this.retries = 0;
                if (this.backoff !== undefined) {
                    this.backoff.reset(); // reset backoff
                }
                if (this.buffer !== undefined) {
                    this.buffer.forEach(this.send.bind(this)); // send all messages in buffer and clear buffer
                    this.buffer.clear()
                }
                break;
        }

        this.dispatchEvent<K>(type, ev); // dispatch event to all listeners
    }

    /**
     * Reconnects the websocket.
     * @private - should only be called by the websocket.
     */
    private reconnect() {
        if (this.backoff === undefined) {
            return; // no backoff, no reconnect
        }

        const backoff = this.backoff.next(); // get next backoff

        const dispatchRetryEventAndRetry = () => {
            const retryEventDetails: RetryEventDetails = {backoff, retries: ++this.retries}
            const retryEvent = new CustomEvent<RetryEventDetails>(WebsocketEvent.retry, {detail: retryEventDetails});
            this.dispatchEvent(WebsocketEvent.retry, retryEvent); // dispatch retry event to all listeners and try to reconnect
            this.tryConnect();
        }

        setTimeout(dispatchRetryEventAndRetry, backoff); // wait for backoff and try to reconnect
    }
}
