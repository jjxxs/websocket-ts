import {Backoff} from "./backoff/backoff";
import {WebsocketBuffer} from "./websocket_buffer";
import {
    ReconnectEventDetail,
    RetryEventDetail,
    WebsocketEvent,
    WebsocketEventListener,
    WebsocketEventListenerOptions,
    WebsocketEventListeners,
    WebsocketEventListenerWithOptions,
    WebsocketEventMap
} from "./websocket_event";


/**
 * A websocket wrapper that can be configured to reconnect automatically and buffer messages when the websocket is not connected.
 */
export class Websocket {
    private readonly _url: string;
    private readonly _protocols?: string | string[];
    private readonly _buffer?: WebsocketBuffer;
    private readonly _backoff?: Backoff;
    private readonly listeners: WebsocketEventListeners = {open: [], close: [], error: [], message: [], retry: [], reconnect: []};

    private _closedByUser: boolean = false; // whether the websocket was closed by the user
    private _lastConnection?: Date; // timestamp of the last connection
    private _underlyingWebsocket?: WebSocket; // the underlying websocket, e.g. native browser websocket
    private retryTimeout?: number; // timeout for the next retry, if any


    /**
     * Creates a new websocket.
     *
     * @param url to connect to.
     * @param protocols optional protocols to use.
     * @param buffer optional buffer to use, if not provided, messages will be dropped when the websocket is not connected.
     * @param backoff optional backoff to use for reconnecting, if not provided, no scheduleConnectionRetryIfNeeded will be attempted.
     * @param listeners optional listeners to use at creation.
     */
    constructor(url: string, protocols?: string | string[], buffer?: WebsocketBuffer, backoff?: Backoff, listeners?: WebsocketEventListeners) {
        this._url = url;
        this._protocols = protocols;
        this._buffer = buffer;
        this._backoff = backoff;
        this.listeners = listeners || this.listeners;
        this.tryConnect();
    }


    /**
     * Getter for the url.
     *
     * @return the url.
     */
    get url(): string {
        return this._url;
    }


    /**
     * Getter for the protocols.
     *
     * @return the protocols, or undefined if none were provided.
     */
    get protocols(): string | string[] | undefined {
        return this._protocols
    }


    /**
     * Getter for the buffer.
     *
     * @return the buffer, or undefined if none was provided.
     */
    get buffer(): WebsocketBuffer | undefined {
        return this._buffer
    }


    /**
     * Getter for the backoff.
     *
     * @return the backoff, or undefined if none was provided.
     */
    get backoff(): Backoff | undefined {
        return this._backoff
    }


    /**
     * Whether the websocket was closed by the user. A websocket is closed by the user if the close().
     *
     * @return true if the websocket was closed by the user, false otherwise.
     */
    get closedByUser(): boolean {
        return this._closedByUser;
    }


    /**
     * Getter for the last 'open' event, e.g. the last time the websocket was connected.
     *
     * @return the last 'open' event, or undefined if the websocket was never connected.
     */
    get lastConnection(): Date | undefined {
        return this._lastConnection
    }


    /**
     * Getter for the underlying websocket. This can be used to access the browser's native websocket directly.
     *
     * @see https://developer.mozilla.org/en-US/docs/Web/API/WebSocket
     * @return the underlying websocket or undefined if it was not created yet.
     */
    get underlyingWebsocket(): WebSocket | undefined {
        return this._underlyingWebsocket;
    }


    /**
     * Getter for the readyState of the underlying websocket.
     *
     * @see https://developer.mozilla.org/en-US/docs/Web/API/WebSocket/readyState
     * @return the readyState of the underlying websocket or undefined if the websocket was not created yet.
     */
    get readyState(): number | undefined {
        return this._underlyingWebsocket?.readyState;
    }


    /**
     * Getter for the bufferedAmount of the underlying websocket.
     *
     * @see https://developer.mozilla.org/en-US/docs/Web/API/WebSocket/bufferedAmount
     * @return the bufferedAmount of the underlying websocket or undefined if the websocket was not created yet.
     */
    get bufferedAmount(): number | undefined {
        return this._underlyingWebsocket?.bufferedAmount;
    }


    /**
     * Getter for the extensions of the underlying websocket.
     *
     * @see https://developer.mozilla.org/en-US/docs/Web/API/WebSocket/extensions
     * @return the extensions of the underlying websocket or undefined if the websocket was not created yet.
     */
    get extensions(): string | undefined {
        return this._underlyingWebsocket?.extensions;
    }


    /**
     * Getter for the binaryType of the underlying websocket.
     *
     * @see https://developer.mozilla.org/en-US/docs/Web/API/WebSocket/binaryType
     * @return the binaryType of the underlying websocket or undefined if the websocket was not created yet.
     */
    get binaryType(): BinaryType | undefined {
        return this._underlyingWebsocket?.binaryType;
    }


    /**
     * Sends data over the websocket.
     *
     * If the websocket is not connected and a buffer was provided on creation, the data will be added to the buffer.
     * If no buffer was provided or the websocket was closed by the user, the data will be dropped.
     *
     * @see https://developer.mozilla.org/en-US/docs/Web/API/WebSocket/send
     * @param data to send.
     */
    public send(data: string | ArrayBufferLike | Blob | ArrayBufferView): void {
        if (this.closedByUser) return // no-op if closed by user

        if (this._underlyingWebsocket !== undefined && this._underlyingWebsocket.readyState === this._underlyingWebsocket.OPEN) {
            this._underlyingWebsocket.send(data) // websocket is connected, send data
        } else if (this.buffer !== undefined) {
            this.buffer.add(data) // websocket is not connected, add data to buffer
        }
    }


    /**
     * Close the websocket. No connection-retry will be attempted after this.
     *
     * @see https://developer.mozilla.org/en-US/docs/Web/API/WebSocket/close
     * @param code optional close code.
     * @param reason optional close reason.
     */
    public close(code?: number, reason?: string): void {
        this.cancelScheduledConnectionRetry(); // cancel any scheduled retries
        this._closedByUser = true; // mark websocket as closed by user

        if (this._underlyingWebsocket !== undefined) {
            this._underlyingWebsocket.close(code, reason); // close underlying websocket with provided code and reason
        }
    }


    /**
     * Adds an event listener for the given event-type.
     *
     * @see https://developer.mozilla.org/en-US/docs/Web/API/EventTarget/addEventListener
     * @param type of the event to add the listener for.
     * @param listener to add.
     * @param options to use when adding the listener.
     */
    public addEventListener<K extends WebsocketEvent>(type: K, listener: WebsocketEventListener<K>, options?: WebsocketEventListenerOptions): void {
        this.listeners[type].push({listener, options}); // add listener to list of listeners
    }


    /**
     * Removes one or more event listener for the given event-type that match the given listener and options.
     *
     * @param type of the event to remove the listener for.
     * @param listener to remove.
     * @param options that were used when the listener was added.
     */
    public removeEventListener<K extends WebsocketEvent>(type: K, listener: WebsocketEventListener<K>, options?: WebsocketEventListenerOptions): void {
        const isListenerNotToBeRemoved = (l: WebsocketEventListenerWithOptions<K>) =>
            l.listener !== listener || l.options !== options;

        (this.listeners[type] as WebsocketEventListenerWithOptions<K>[]) =
            this.listeners[type].filter(isListenerNotToBeRemoved); // only keep listeners that are not to be removed
    }


    /**
     * Creates a new browser-native websocket and connects it to the given URL with the given protocols
     * and adds all event listeners to the browser-native websocket.
     */
    private tryConnect(): void {
        if (this._underlyingWebsocket !== undefined) { // websocket was already created, this is a retry. remove all event listeners, close and start over.
            this._underlyingWebsocket.removeEventListener(WebsocketEvent.open, this.handleOpenEvent);
            this._underlyingWebsocket.removeEventListener(WebsocketEvent.close, this.handleCloseEvent);
            this._underlyingWebsocket.removeEventListener(WebsocketEvent.error, this.handleErrorEvent);
            this._underlyingWebsocket.removeEventListener(WebsocketEvent.message, this.handleMessageEvent);
            this._underlyingWebsocket.close();
        }

        this._underlyingWebsocket = new WebSocket(this.url, this.protocols); // create new browser-native websocket and add all event listeners
        this._underlyingWebsocket.addEventListener(WebsocketEvent.open, this.handleOpenEvent);
        this._underlyingWebsocket.addEventListener(WebsocketEvent.close, this.handleCloseEvent);
        this._underlyingWebsocket.addEventListener(WebsocketEvent.error, this.handleErrorEvent);
        this._underlyingWebsocket.addEventListener(WebsocketEvent.message, this.handleMessageEvent);
    }


    /**
     * Handles the 'open' event of the browser-native websocket.
     * @param event to handle.
     */
    private handleOpenEvent = (event: Event) =>
        this.handleEvent(WebsocketEvent.open, event);


    /**
     * Handles the 'error' event of the browser-native websocket.
     * @param event to handle.
     */
    private handleErrorEvent = (event: Event) =>
        this.handleEvent(WebsocketEvent.error, event);


    /**
     * Handles the 'close' event of the browser-native websocket.
     * @param event to handle.
     */
    private handleCloseEvent = (event: CloseEvent) =>
        this.handleEvent(WebsocketEvent.close, event);


    /**
     * Handles the 'message' event of the browser-native websocket.
     * @param event to handle.
     */
    private handleMessageEvent = (event: MessageEvent) =>
        this.handleEvent(WebsocketEvent.message, event);


    /**
     * Dispatch an event to all listeners of the given event-type.
     *
     * @param type of the event to dispatch.
     * @param event to dispatch.
     */
    private dispatchEvent<K extends WebsocketEvent>(type: K, event: WebsocketEventMap[K]) {
        const eventListeners: WebsocketEventListeners[K] = this.listeners[type];
        const newEventListeners: WebsocketEventListeners[K] = [];

        eventListeners.forEach(({listener, options}) => {
            listener(this, event); // invoke listener with event

            if (options === undefined || options.once === undefined || !options.once) {
                newEventListeners.push({listener, options}); // only keep listener if it isn't a once-listener
            }
        });

        this.listeners[type] = newEventListeners; // replace old listeners with new listeners that don't include once-listeners
    }


    /**
     *
     * @param type of the event to handle.
     * @param event to handle.
     */
    private handleEvent<K extends WebsocketEvent>(type: K, event: WebsocketEventMap[K]) {
        switch (type) {

            case WebsocketEvent.close:
                this.dispatchEvent(type, event);
                this.scheduleConnectionRetryIfNeeded(); // schedule a new connection retry if the websocket was closed by the server
                break;

            case WebsocketEvent.open:
                if (this.backoff !== undefined && this._lastConnection !== undefined) { // websocket was reconnected, dispatch reconnect event and reset backoff
                    const detail: ReconnectEventDetail = {retries: this.backoff.retries, lastConnection: new Date(this._lastConnection)}
                    const event: CustomEvent<ReconnectEventDetail> = new CustomEvent<ReconnectEventDetail>(WebsocketEvent.reconnect, {detail})
                    this.dispatchEvent(WebsocketEvent.reconnect, event)
                    this.backoff.reset();
                }
                this._lastConnection = new Date();
                this.dispatchEvent(type, event); // dispatch open event and send buffered data
                this.sendBufferedData();
                break;

            case WebsocketEvent.retry:
                this.dispatchEvent(type, event); // dispatch retry event and try to connect
                this.tryConnect();
                break;

            default:
                this.dispatchEvent(type, event); // dispatch event to all listeners of the given event-type
                break;
        }
    }


    /**
     * Sends buffered data if there is a buffer defined.
     */
    private sendBufferedData() {
        if (this.buffer === undefined) {
            return; // no buffer defined, nothing to send
        }

        for (let ele = this.buffer.read(); ele !== undefined; ele = this.buffer.read()) {
            this.send(ele) // send buffered data
        }
    }


    /**
     * Schedules a connection-retry if there is a backoff defined and the websocket was not closed by the user.
     */
    private scheduleConnectionRetryIfNeeded() {
        if (this.closedByUser) {
            return; // user closed the websocket, no retry
        }
        if (this.backoff === undefined) {
            return; // no backoff defined, no retry
        }

        const handleRetryEvent = (detail: RetryEventDetail) => {
            const event: CustomEvent<RetryEventDetail> = new CustomEvent(WebsocketEvent.retry, {detail});
            this.handleEvent(WebsocketEvent.retry, event);
        }

        const detail: RetryEventDetail = {backoff: this.backoff.next, retries: this.backoff.retries, lastConnection: this._lastConnection}
        this.retryTimeout = window.setTimeout(() => handleRetryEvent(detail), detail.backoff);
    }


    /**
     * Cancels the scheduled connection-retry, if there is one.
     */
    private cancelScheduledConnectionRetry() {
        window.clearTimeout(this.retryTimeout)
    }
}
