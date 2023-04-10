import {Backoff} from "./backoff/backoff";
import {WebsocketEvent, WebsocketEventListener, WebsocketEventListenerOptions, WebsocketEventListeners} from "./websocket_event";
import {Websocket} from "./websocket";
import {WebsocketBuffer} from "./websocket_buffer";


/**
 * Builder for websockets.
 */
export class WebsocketBuilder {
    private readonly _url: string;
    private readonly listeners: WebsocketEventListeners = {open: [], close: [], error: [], message: [], retry: [], reconnect: []};

    private _protocols?: string | string[];
    private _backoff?: Backoff;
    private _buffer?: WebsocketBuffer;


    /**
     * Creates a new WebsocketBuilder.
     *
     * @param url the url to connect to
     */
    constructor(url: string) {
        this._url = url;
    }


    /**
     * Getter for the url.
     *
     * @returns the url
     */
    get url(): string {
        return this._url;
    }


    /**
     * Adds protocols to the websocket. Subsequent calls to this method will override the previously set protocols.
     *
     * @param protocols the protocols to add
     */
    public withProtocols(protocols: string | string[] | undefined): WebsocketBuilder {
        this._protocols = protocols;
        return this;
    }


    /**
     * Getter for the protocols.
     *
     * @returns the protocols, undefined if no protocols have been set
     */
    get protocols(): string | string[] | undefined {
        return this._protocols;
    }


    /**
     * Adds a backoff to the websocket. Subsequent calls to this method will override the previously set backoff.
     *
     * @param backoff the backoff to add
     */
    public withBackoff(backoff: Backoff | undefined): WebsocketBuilder {
        this._backoff = backoff;
        return this;
    }


    /**
     * Getter for the backoff.
     *
     * @returns the backoff, undefined if no backoff has been set
     */
    get backoff(): Backoff | undefined {
        return this._backoff;
    }


    /**
     * Adds a buffer to the websocket. Subsequent calls to this method will override the previously set buffer.
     *
     * @param buffer the buffer to add
     */
    public withBuffer(buffer: WebsocketBuffer | undefined): WebsocketBuilder {
        this._buffer = buffer;
        return this;
    }


    /**
     * Getter for the buffer.
     *
     * @returns the buffer, undefined if no buffer has been set
     */
    get buffer(): WebsocketBuffer | undefined {
        return this._buffer;
    }


    /**
     * Adds an 'open' event listener to the websocket. Subsequent calls to this method will add additional listeners that will be
     * called in the order they were added.
     *
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
     *
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
     *
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
     *
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
     *
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
     *
     * @param listener the listener to add
     * @param options the listener options
     */
    public onReconnect(listener: WebsocketEventListener<WebsocketEvent.reconnect>, options?: WebsocketEventListenerOptions): WebsocketBuilder {
        this.listeners.reconnect.push({listener, options});
        return this;
    }


    /**
     * Builds the websocket.
     *
     * @return a new websocket, with the set options
     */
    public build(): Websocket {
        return new Websocket(this._url, this._protocols, this._buffer, this._backoff, this.listeners); // instantiate the websocket
    }
}
