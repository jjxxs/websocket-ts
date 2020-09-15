import {Backoff} from "./backoff/backoff";
import {Buffer} from "./buffer/buffer";

type eventListener<K extends WebsocketEvents> = {
    readonly listener: (instance: Websocket, ev: WebsocketEventMap[K]) => any;
    readonly options?: boolean | AddEventListenerOptions;
}

export enum WebsocketEvents {
    open = 'open',
    close = 'close',
    error = 'error',
    message = 'message',
    retry = 'retry'
}

interface WebsocketEventMap {
    close: CloseEvent;
    error: Event;
    message: MessageEvent;
    open: Event;
    retry: CustomEvent<RetryEventDetails>;
}

export interface RetryEventDetails {
    readonly retriesSinceLastConnection: number;
    readonly lastBackoff: number
}

type Listeners = {
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
    private readonly buffer?: Buffer<string | ArrayBufferLike | Blob | ArrayBufferView>;
    private readonly backoff?: Backoff;
    private readonly listeners: Listeners = {open: [], close: [], error: [], message: [], retry: []};
    private closedByUser: boolean = false;
    private websocket?: WebSocket;
    private timer?: ReturnType<typeof setTimeout>;
    private retriesSinceLastConnection: number = 0;

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
        if (this.websocket === undefined || this.websocket.readyState !== this.websocket.OPEN) {
            this.buffer?.Write([data]);
        } else {
            this.websocket.send(data);
        }
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
        const eventListeners = this.listeners[type] as eventListener<K>[];
        eventListeners.push(eventListener);
    }

    public removeEventListener<K extends WebsocketEvents>(
        type: K,
        listener: (instance: Websocket, ev: WebsocketEventMap[K]) => any,
        options?: boolean | EventListenerOptions): void {
        const shouldRemove = (l: eventListener<K>): boolean => l.listener === listener && l.options === options;
        let listeners = this.listeners[type] as eventListener<K>[];
        listeners = listeners.filter(l => shouldRemove(l));
        (this.listeners[type] as eventListener<K>[]) = listeners;
    }

    private dispatchEvent<K extends WebsocketEvents>(type: K, ev: WebsocketEventMap[K]) {
        const remove = [] as eventListener<K>[];
        const dispatch = (l: eventListener<K>) => {
            l.listener(this, ev);
            if (l.options !== undefined && (l.options as AddEventListenerOptions).once)
                remove.push(l);
            if (l.options !== undefined && (l.options as AddEventListenerOptions).passive && ev.defaultPrevented)
                console.log("default was prevent when listener was marked as passive");
        }
        const listeners = this.listeners[type] as eventListener<K>[];
        listeners.forEach(l => dispatch(l));
        remove.forEach(l => this.removeEventListener(type, l.listener, l.options))
    }

    private tryConnect(): void {
        if (this.websocket !== undefined) {
            this.websocket.removeEventListener(WebsocketEvents.open, ev => this.handleEvent(WebsocketEvents.open, ev))
            this.websocket.removeEventListener(WebsocketEvents.close, ev => this.handleEvent(WebsocketEvents.close, ev))
            this.websocket.removeEventListener(WebsocketEvents.error, ev => this.handleEvent(WebsocketEvents.error, ev))
            this.websocket.removeEventListener(WebsocketEvents.message, ev => this.handleEvent(WebsocketEvents.message, ev))
            this.websocket.close();
        }
        this.websocket = new WebSocket(this.url, this.protocols);
        this.websocket.addEventListener(WebsocketEvents.open, ev => this.handleEvent(WebsocketEvents.open, ev));
        this.websocket.addEventListener(WebsocketEvents.close, ev => this.handleEvent(WebsocketEvents.close, ev));
        this.websocket.addEventListener(WebsocketEvents.error, ev => this.handleEvent(WebsocketEvents.error, ev));
        this.websocket.addEventListener(WebsocketEvents.message, ev => this.handleEvent(WebsocketEvents.message, ev));
    }

    private handleEvent<K extends WebsocketEvents>(type: K, ev: WebsocketEventMap[K]) {
        const wsIsClosed = this.websocket?.readyState == this.websocket?.CLOSED;
        const wsIsClosing = this.websocket?.readyState === this.websocket?.CLOSING;
        if (!this.closedByUser && (wsIsClosed || wsIsClosing)) {
            this.reconnectWithBackoff();
        }
        if (type === WebsocketEvents.open) {
            if (this.timer !== undefined)
                clearTimeout(this.timer);
            this.retriesSinceLastConnection = 0;
            this.backoff?.Reset();
            if (this.buffer !== undefined)
                this.buffer.forEach(e => this.send(e));
        }
        this.dispatchEvent<K>(type, ev);
    }

    private reconnectWithBackoff() {
        if (this.backoff === undefined)
            return;
        if (this.timer !== undefined)
            clearTimeout(this.timer);
        const backoff = this.backoff.Next();
        this.timer = setTimeout(() => {
            this.dispatchEvent(WebsocketEvents.retry,
                new CustomEvent<RetryEventDetails>(WebsocketEvents.retry,
                    {
                        detail: {
                            retriesSinceLastConnection: ++this.retriesSinceLastConnection,
                            lastBackoff: backoff
                        }
                    }));
            this.tryConnect();
        }, backoff);
    }
}