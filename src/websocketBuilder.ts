import {Backoff} from "./backoff/backoff";
import {Buffer} from "./buffer/buffer";
import {RetryEventDetails, Websocket, WebsocketEvents} from "./websocket";

/**
 * Used to build Websocket-instances.
 */
export class WebsocketBuilder {
    private readonly url: string;
    private ws: Websocket | null = null;
    private protocols?: string | string[];
    private backoff?: Backoff;
    private buffer?: Buffer<string | ArrayBufferLike | Blob | ArrayBufferView>;
    private onOpenListeners: ({
        listener: (instance: Websocket, ev: Event) => any,
        options?: boolean | EventListenerOptions
    })[] = [];
    private onCloseListeners: ({
        listener: (instance: Websocket, ev: CloseEvent) => any,
        options?: boolean | EventListenerOptions
    })[] = [];
    private onErrorListeners: ({
        listener: (instance: Websocket, ev: Event) => any,
        options?: boolean | EventListenerOptions
    })[] = [];
    private onMessageListeners: ({
        listener: (instance: Websocket, ev: MessageEvent) => any,
        options?: boolean | EventListenerOptions
    })[] = [];
    private onRetryListeners: ({
        listener: (instance: Websocket, ev: CustomEvent<RetryEventDetails>) => any,
        options?: boolean | EventListenerOptions
    })[] = [];

    constructor(url: string) {
        this.url = url;
    }

    public withProtocols(p: string | string[]): WebsocketBuilder {
        this.protocols = p;
        return this;
    }

    public withBackoff(backoff: Backoff): WebsocketBuilder {
        this.backoff = backoff;
        return this;
    }

    public withBuffer(buffer: Buffer<any>): WebsocketBuilder {
        this.buffer = buffer;
        return this;
    }

    public onOpen(listener: (instance: Websocket, ev: Event) => any,
                  options?: boolean | EventListenerOptions): WebsocketBuilder {
        this.onOpenListeners.push({listener, options});
        return this;
    }

    public onClose(listener: (instance: Websocket, ev: CloseEvent) => any,
                   options?: boolean | EventListenerOptions): WebsocketBuilder {
        this.onCloseListeners.push({listener, options});
        return this;
    }

    public onError(listener: (instance: Websocket, ev: Event) => any,
                   options?: boolean | EventListenerOptions): WebsocketBuilder {
        this.onErrorListeners.push({listener, options});
        return this;
    }

    public onMessage(listener: (instance: Websocket, ev: MessageEvent) => any,
                     options?: boolean | EventListenerOptions): WebsocketBuilder {
        this.onMessageListeners.push({listener, options});
        return this;
    }

    public onRetry(listener: (instance: Websocket, ev: CustomEvent<RetryEventDetails>) => any,
                   options?: boolean | EventListenerOptions): WebsocketBuilder {
        this.onRetryListeners.push({listener, options});
        return this;
    }

    /**
     * Multiple calls to build() will always return the same websocket-instance.
     */
    public build(): Websocket {
        if (this.ws !== null)
            return this.ws;
        this.ws = new Websocket(this.url, this.protocols, this.buffer, this.backoff);
        this.onOpenListeners.forEach(h => this.ws?.addEventListener(WebsocketEvents.open, h.listener, h.options));
        this.onCloseListeners.forEach(h => this.ws?.addEventListener(WebsocketEvents.close, h.listener, h.options));
        this.onErrorListeners.forEach(h => this.ws?.addEventListener(WebsocketEvents.error, h.listener, h.options));
        this.onMessageListeners.forEach(h => this.ws?.addEventListener(WebsocketEvents.message, h.listener, h.options));
        this.onRetryListeners.forEach(h => this.ws?.addEventListener(WebsocketEvents.retry, h.listener, h.options));
        return this.ws;
    }
}