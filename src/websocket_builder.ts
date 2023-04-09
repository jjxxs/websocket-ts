import {Backoff} from "./backoff/backoff";
import {WebsocketEvent, WebsocketEventListener, WebsocketEventListenerOptions, WebsocketEventListeners} from "./websocket_event";
import {Websocket} from "./websocket";
import {WebsocketBuffer} from "./websocket_buffer";


/**
 * Builder for websockets.
 */
export class WebsocketBuilder {
    private readonly url: string;
    private readonly listeners: WebsocketEventListeners = {open: [], close: [], error: [], message: [], retry: [], reconnect: []};

    private ws: Websocket | null = null;
    private protocols?: string | string[];
    private backoff?: Backoff;
    private buffer?: WebsocketBuffer;


    /**
     * Creates a new WebsocketBuilder.
     * @param url the url to connect to
     */
    constructor(url: string) {
        this.url = url;
    }


    /**
     * Adds protocols to the websocket. Subsequent calls to this method will override the previously set protocols.
     * @param protocols the protocols to add
     */
    public withProtocols(protocols: string | string[] | undefined): WebsocketBuilder {
        this.protocols = protocols;
        return this;
    }


    /**
     * Adds a backoff to the websocket. Subsequent calls to this method will override the previously set backoff.
     * @param backoff the backoff to add
     */
    public withBackoff(backoff: Backoff | undefined): WebsocketBuilder {
        this.backoff = backoff;
        return this;
    }


    /**
     * Adds a buffer to the websocket. Subsequent calls to this method will override the previously set buffer.
     * @param buffer the buffer to add
     */
    public withBuffer(buffer: WebsocketBuffer | undefined): WebsocketBuilder {
        this.buffer = buffer;
        return this;
    }


    /**
     * Adds an 'open' event listener to the websocket. Subsequent calls to this method will add additional listeners that will be
     * called in the order they were added.
     * @param listener the listener to add
     * @param options the listener options
     */
    public onOpen(listener: WebsocketEventListener<WebsocketEvent.open>, options?: WebsocketEventListenerOptions): WebsocketBuilder {
        this.listeners.open.push({listener, options});
        return this;
    }


    /**
     * Adds an 'close' event listener to the websocket. Subsequent calls to this method will add additional listeners that will be
     * called in the order they were added.
     * @param listener the listener to add
     * @param options the listener options
     */
    public onClose(listener: WebsocketEventListener<WebsocketEvent.close>, options?: WebsocketEventListenerOptions): WebsocketBuilder {
        this.listeners.close.push({listener, options});
        return this;
    }


    /**
     * Adds an 'error' event listener to the websocket. Subsequent calls to this method will add additional listeners that will be
     * called in the order they were added.
     * @param listener the listener to add
     * @param options the listener options
     */
    public onError(listener: WebsocketEventListener<WebsocketEvent.error>, options?: WebsocketEventListenerOptions): WebsocketBuilder {
        this.listeners.error.push({listener, options});
        return this;
    }


    /**
     * Adds an 'message' event listener to the websocket. Subsequent calls to this method will add additional listeners that will be
     * called in the order they were added.
     * @param listener the listener to add
     * @param options the listener options
     */
    public onMessage(listener: WebsocketEventListener<WebsocketEvent.message>, options?: WebsocketEventListenerOptions): WebsocketBuilder {
        this.listeners.message.push({listener, options});
        return this;
    }


    /**
     * Adds an 'retry' event listener to the websocket. Subsequent calls to this method will add additional listeners that will be
     * called in the order they were added.
     * @param listener the listener to add
     * @param options the listener options
     */
    public onRetry(listener: WebsocketEventListener<WebsocketEvent.retry>, options?: WebsocketEventListenerOptions): WebsocketBuilder {
        this.listeners.retry.push({listener, options});
        return this;
    }


    /**
     * Adds an 'reconnect' event listener to the websocket. Subsequent calls to this method will add additional listeners that will be
     * called in the order they were added.
     * @param listener the listener to add
     * @param options the listener options
     */
    public onReconnect(listener: WebsocketEventListener<WebsocketEvent.reconnect>, options?: WebsocketEventListenerOptions): WebsocketBuilder {
        this.listeners.reconnect.push({listener, options});
        return this;
    }


    /**
     * Builds the websocket. Subsequent calls to this method will return the same instance.
     * @return the websocket instance
     */
    public build(): Websocket {
        if (this.ws !== null) {
            return this.ws; // already built, return instance
        }

        this.ws = new Websocket(this.url, this.protocols, this.buffer, this.backoff, this.listeners); // instantiate the websocket
        return this.ws;
    }
}
