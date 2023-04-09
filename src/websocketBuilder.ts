import {Backoff} from "./backoff/backoff";
import {Buffer} from "./queue/queue";
import {
    Websocket,
    WebsocketBuffer,
    WebsocketEvent,
    WebsocketEventListeners,
    WebsocketEventListener,
    WebsocketEventListenerOptions
} from "./websocket";


/**
 * WebsocketBuilder is used to build a websocket.
 */
export class WebsocketBuilder {
    private readonly url: string;
    private readonly eventListeners: WebsocketEventListeners = {open: [], close: [], error: [], message: [], retry: []};

    private ws: Websocket | null = null;
    private protocols?: string | string[];
    private backoff?: Backoff;
    private buffer?: Buffer<string | ArrayBufferLike | Blob | ArrayBufferView>;

    constructor(url: string) {
        this.url = url;
    }


    /**
     * Adds protocols to the websocket. Subsequent calls to this method will override the previous protocols.
     * @param protocols
     */
    public withProtocols(protocols: string | string[]): WebsocketBuilder {
        this.protocols = protocols;
        return this;
    }

    /**
     * Adds a backoff to the websocket.
     * @param backoff the backoff to add
     */
    public withBackoff(backoff: Backoff): WebsocketBuilder {
        this.backoff = backoff;
        return this;
    }

    /**
     * Adds a queue to the websocket.
     * @param buffer the queue to add
     */
    public withBuffer(buffer: WebsocketBuffer): WebsocketBuilder {
        this.buffer = buffer;
        return this;
    }

    /**
     * Adds a listener for the open-event.
     * @param listener the listener to add
     * @param options the options for the listener
     */
    public onOpen(listener: WebsocketEventListener<WebsocketEvent.open>, options?: WebsocketEventListenerOptions): WebsocketBuilder {
        this.eventListeners.open.push({listener, options});
        return this;
    }

    /**
     * Adds a listener for the close-event.
     * @param listener the listener to add
     * @param options the options for the listener
     */
    public onClose(listener: WebsocketEventListener<WebsocketEvent.close>, options?: WebsocketEventListenerOptions): WebsocketBuilder {
        this.eventListeners.close.push({listener, options});
        return this;
    }

    /**
     * Adds a listener for the error-event.
     * @param listener the listener to add
     * @param options the options for the listener
     */
    public onError(listener: WebsocketEventListener<WebsocketEvent.error>, options?: WebsocketEventListenerOptions): WebsocketBuilder {
        this.eventListeners.error.push({listener, options});
        return this;
    }

    /**
     * Adds a listener for the message-event.
     * @param listener the listener to add
     * @param options the options for the listener
     */
    public onMessage(listener: WebsocketEventListener<WebsocketEvent.message>, options?: WebsocketEventListenerOptions): WebsocketBuilder {
        this.eventListeners.message.push({listener, options});
        return this;
    }

    /**
     * Adds a listener for the retry-event.
     * @param listener the listener to add
     * @param options the options for the listener
     */
    public onRetry(listener: WebsocketEventListener<WebsocketEvent.retry>, options?: WebsocketEventListenerOptions): WebsocketBuilder {
        this.eventListeners.retry.push({listener, options});
        return this;
    }

    /**
     * Builds/instantiates the websocket. Multiple calls to build() will return the same instance.
     */
    public build(): Websocket {
        if (this.ws !== null) {
            return this.ws; // return the same instance, if already built
        }

        const ws = this.ws = new Websocket(this.url, this.protocols, this.buffer, this.backoff); // instantiate the websocket

        // add all listeners
        this.eventListeners.open.forEach(l => ws.addEventListener(WebsocketEvent.open, l.listener, l.options));
        this.eventListeners.close.forEach(l => ws.addEventListener(WebsocketEvent.close, l.listener, l.options));
        this.eventListeners.error.forEach(l => ws.addEventListener(WebsocketEvent.error, l.listener, l.options));
        this.eventListeners.message.forEach(l => ws.addEventListener(WebsocketEvent.message, l.listener, l.options));
        this.eventListeners.retry.forEach(l => ws.addEventListener(WebsocketEvent.retry, l.listener, l.options));

        return this.ws;
    }
}
