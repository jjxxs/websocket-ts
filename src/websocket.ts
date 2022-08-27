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

interface WebsocketEventMap {
    close: CloseEvent;
    error: Event;
    message: MessageEvent;
    open: Event;
    retry: CustomEvent<RetryEventDetails>;
}


type wsEventListener<K extends WebsocketEvent> = (instance: Websocket, ev: WebsocketEventMap[K]) => any;

type wsEventListenerOptions = boolean | EventListenerOptions;

type wsEventListenerWithOptions<K extends WebsocketEvent> = {
    readonly listener: wsEventListener<K>;
    readonly options?: wsEventListenerOptions;
}

type WebsocketEventListeners = {
    open: wsEventListenerWithOptions<WebsocketEvent.open>[];
    close: wsEventListenerWithOptions<WebsocketEvent.close>[];
    error: wsEventListenerWithOptions<WebsocketEvent.error>[];
    message: wsEventListenerWithOptions<WebsocketEvent.message>[];
    retry: wsEventListenerWithOptions<WebsocketEvent.retry>[];
}

type WebsocketBuffer = Buffer<string | ArrayBufferLike | Blob | ArrayBufferView>;

export class Websocket {
    private readonly url: string; // URL to connect to, e.g. "ws://localhost:8080/websocket", "wss://localhost:8080/websocket"
    private readonly protocols?: string | string[];
    private readonly buffer?: WebsocketBuffer; // optional buffer for messages to send when the websocket is not yet connected
    private readonly backoff?: Backoff; // optional backoff to use when retrying a connection
    private readonly eventListeners: WebsocketEventListeners = {open: [], close: [], error: [], message: [], retry: []};
    private closedByUser: boolean = false;
    private websocket?: WebSocket;
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
     * Sends data over the websocket or queues it for sending if the websocket is not yet connected and a buffer is configured.
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
        const notListenerToBeRemoved = (l: wsEventListenerWithOptions<K>) => l.listener !== listener && (l.options === undefined || l.options !== options);

        (this.eventListeners[type] as wsEventListenerWithOptions<K>[]) =
            (this.eventListeners[type] as wsEventListenerWithOptions<K>[])
                .filter(notListenerToBeRemoved); // only keep listeners that are not to be removed
    }

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

        (this.eventListeners[type] as wsEventListenerWithOptions<K>[]) = newEventListeners; // replace old listeners with new ones
    }

    private tryConnect(): void {
        if (this.websocket !== undefined) { // remove all event-listeners from broken socket
            this.websocket.removeEventListener(WebsocketEvent.open, this.handleOpenEvent);
            this.websocket.removeEventListener(WebsocketEvent.close, this.handleCloseEvent);
            this.websocket.removeEventListener(WebsocketEvent.error, this.handleErrorEvent);
            this.websocket.removeEventListener(WebsocketEvent.message, this.handleMessageEvent);
            this.websocket.close();
        }
        this.websocket = new WebSocket(this.url, this.protocols); // create new socket and attach handlers
        this.websocket.addEventListener(WebsocketEvent.open, this.handleOpenEvent);
        this.websocket.addEventListener(WebsocketEvent.close, this.handleCloseEvent);
        this.websocket.addEventListener(WebsocketEvent.error, this.handleErrorEvent);
        this.websocket.addEventListener(WebsocketEvent.message, this.handleMessageEvent);
    }

    private handleOpenEvent = (ev: Event) => this.handleEvent(WebsocketEvent.open, ev);

    private handleCloseEvent = (ev: CloseEvent) => this.handleEvent(WebsocketEvent.close, ev);

    private handleErrorEvent = (ev: Event) => this.handleEvent(WebsocketEvent.error, ev);

    private handleMessageEvent = (ev: MessageEvent) => this.handleEvent(WebsocketEvent.message, ev);

    private handleEvent<K extends WebsocketEvent>(type: K, ev: WebsocketEventMap[K]) {
        switch (type) {
            case WebsocketEvent.close:
                if (!this.closedByUser) // failed to connect or connection lost, try to reconnect
                    this.reconnect();
                break;
            case WebsocketEvent.open:
                this.retries = 0;
                this.backoff?.reset(); // reset backoff
                this.buffer?.forEach(this.send.bind(this)); // send all buffered messages
                this.buffer?.clear();
                break;
        }
        this.dispatchEvent<K>(type, ev); // forward to all listeners
    }

    private reconnect() {
        if (this.backoff === undefined) // no backoff, we're done
            return;
        const backoff = this.backoff.next();
        setTimeout(() => {   // retry connection after waiting out the backoff-interval
            this.dispatchEvent(WebsocketEvent.retry, new CustomEvent<RetryEventDetails>(WebsocketEvent.retry,
                {
                    detail: {
                        retries: ++this.retries,
                        backoff: backoff
                    }
                })
            );
            this.tryConnect();
        }, backoff);
    }
}
