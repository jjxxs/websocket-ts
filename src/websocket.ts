import {Backoff} from "./backoff/backoff";
import {Buffer} from "./buffer/buffer";

type eventListener<K extends WebsocketEvents> = {
    readonly listener: (instance: Websocket, ev: WebsocketEventMap[K]) => any;
    readonly options?: boolean | EventListenerOptions;
}

export enum WebsocketEvents {
    open = 'open',          // Connection is opened or re-opened
    close = 'close',        // Connection is closed
    error = 'error',        // An error occurred
    message = 'message',    // A message was received
    retry = 'retry'         // A try to re-connect is made
}

interface WebsocketEventMap {
    close: CloseEvent;
    error: Event;
    message: MessageEvent;
    open: Event;
    retry: CustomEvent<RetryEventDetails>;
}

export interface RetryEventDetails {
    readonly retries: number;
    readonly backoff: number
}

type WebsocketEventListeners = {
    open: eventListener<WebsocketEvents.open>[];
    close: eventListener<WebsocketEvents.close>[];
    error: eventListener<WebsocketEvents.error>[];
    message: eventListener<WebsocketEvents.message>[];
    retry: eventListener<WebsocketEvents.retry>[];
}

type WebsocketBuffer = Buffer<string | ArrayBufferLike | Blob | ArrayBufferView>;

export class Websocket {
    private readonly url: string;
    private readonly protocols?: string | string[];
    private readonly buffer?: WebsocketBuffer;
    private readonly backoff?: Backoff;
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

    get underlyingWebsocket(): WebSocket | undefined {
        return this.websocket;
    }

    public send(data: string | ArrayBufferLike | Blob | ArrayBufferView): void {
        if (this.closedByUser)
            return;
        if (this.websocket === undefined || this.websocket.readyState !== this.websocket.OPEN)
            this.buffer?.write([data]);
        else
            this.websocket.send(data);
    }

    public close(code?: number, reason?: string): void {
        this.closedByUser = true;
        this.websocket?.close(code, reason);
    }

    public addEventListener<K extends WebsocketEvents>(
        type: K,
        listener: (instance: Websocket, ev: WebsocketEventMap[K]) => any,
        options?: boolean | AddEventListenerOptions): void {
        const eventListener = {listener, options} as eventListener<K>;
        const eventListeners = this.eventListeners[type] as eventListener<K>[];
        eventListeners.push(eventListener);
    }

    public removeEventListener<K extends WebsocketEvents>(
        type: K,
        listener: (instance: Websocket, ev: WebsocketEventMap[K]) => any,
        options?: boolean | EventListenerOptions): void {
        (this.eventListeners[type] as eventListener<K>[]) =
            (this.eventListeners[type] as eventListener<K>[])
                .filter(l => {
                    return l.listener !== listener && (l.options === undefined || l.options !== options);
                });
    }

    private dispatchEvent<K extends WebsocketEvents>(type: K, ev: WebsocketEventMap[K]) {
        const listeners = this.eventListeners[type] as eventListener<K>[];
        const onceListeners = [] as eventListener<K>[];
        listeners.forEach(l => {
            l.listener(this, ev); // call listener
            if (l.options !== undefined && (l.options as AddEventListenerOptions).once)
                onceListeners.push(l);
        });
        onceListeners.forEach(l => this.removeEventListener(type, l.listener, l.options)); // remove 'once'-listeners
    }

    private tryConnect(): void {
        if (this.websocket !== undefined) { // remove all event-listeners from broken socket
            this.websocket.removeEventListener(WebsocketEvents.open, this.handleOpenEvent);
            this.websocket.removeEventListener(WebsocketEvents.close, this.handleCloseEvent);
            this.websocket.removeEventListener(WebsocketEvents.error, this.handleErrorEvent);
            this.websocket.removeEventListener(WebsocketEvents.message, this.handleMessageEvent);
            this.websocket.close();
        }
        this.websocket = new WebSocket(this.url, this.protocols); // create new socket and attach handlers
        this.websocket.addEventListener(WebsocketEvents.open, this.handleOpenEvent);
        this.websocket.addEventListener(WebsocketEvents.close, this.handleCloseEvent);
        this.websocket.addEventListener(WebsocketEvents.error, this.handleErrorEvent);
        this.websocket.addEventListener(WebsocketEvents.message, this.handleMessageEvent);
    }

    private handleOpenEvent = (ev: Event) => this.handleEvent(WebsocketEvents.open, ev);

    private handleCloseEvent = (ev: CloseEvent) => this.handleEvent(WebsocketEvents.close, ev);

    private handleErrorEvent = (ev: Event) => this.handleEvent(WebsocketEvents.error, ev);

    private handleMessageEvent = (ev: MessageEvent) => this.handleEvent(WebsocketEvents.message, ev);

    private handleEvent<K extends WebsocketEvents>(type: K, ev: WebsocketEventMap[K]) {
        switch (type) {
            case WebsocketEvents.close:
                if (!this.closedByUser) // failed to connect or connection lost, try to reconnect
                    this.reconnect();
                break;
            case WebsocketEvents.open:
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
            this.dispatchEvent(WebsocketEvents.retry, new CustomEvent<RetryEventDetails>(WebsocketEvents.retry,
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