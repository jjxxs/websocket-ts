import {Backoff} from "./backoff/backoff";
import {Buffer} from "./buffer/buffer";
import {RetryEventDetails, Websocket, WebsocketEvents} from "./websocket";

/**
 * Used to build Websocket-instances.
 */
export class WebsocketBuilder {
    private readonly url: string;
    private protocols?: string | string[];
    private backoff?: Backoff;
    private buffer?: Buffer<string | ArrayBufferLike | Blob | ArrayBufferView>;
    private onOpenChain: ((instance: Websocket, ev: Event) => any) | null = null;
    private onCloseChain: ((instance: Websocket, ev: CloseEvent) => any) | null = null;
    private onErrorChain: ((instance: Websocket, ev: Event) => any) | null = null;
    private onMessageChain: ((instance: Websocket, ev: MessageEvent) => any) | null = null;
    private onRetryChain: ((instance: Websocket, ev: CustomEvent<RetryEventDetails>) => any) | null = null;
    private ws: Websocket | null = null;

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

    public onOpen(fn: (instance: Websocket, ev: Event) => any): WebsocketBuilder {
        const onOpen = this.onOpenChain;
        this.onOpenChain = (instance: Websocket, ev2: Event) => {
            fn(instance, ev2);
            if (onOpen !== null)
                onOpen(instance, ev2);
        }
        return this;
    }

    public onClose(fn: (instance: Websocket, ev: CloseEvent) => any): WebsocketBuilder {
        const onClose = this.onCloseChain;
        this.onCloseChain = (instance: Websocket, ev2: CloseEvent) => {
            fn(instance, ev2);
            if (onClose !== null)
                onClose(instance, ev2);
        }
        return this;
    }

    public onError(fn: (instance: Websocket, ev: Event) => any): WebsocketBuilder {
        const onError = this.onErrorChain;
        this.onErrorChain = (instance: Websocket, ev2: Event) => {
            fn(instance, ev2);
            if (onError !== null)
                onError(instance, ev2);
        }
        return this;
    }

    public onMessage(fn: (instance: Websocket, ev: MessageEvent) => any): WebsocketBuilder {
        const onMessage = this.onMessageChain;
        this.onMessageChain = (instance: Websocket, ev2: MessageEvent) => {
            fn(instance, ev2);
            if (onMessage !== null)
                onMessage(instance, ev2);
        }
        return this;
    }

    public onRetry(fn: (instance: Websocket, ev: CustomEvent<RetryEventDetails>) => any): WebsocketBuilder {
        const onRetry = this.onRetryChain;
        this.onRetryChain = (instance: Websocket, ev2: CustomEvent<RetryEventDetails>) => {
            fn(instance, ev2);
            if (onRetry !== null)
                onRetry(instance, ev2);
        }
        return this;
    }

    /**
     * Multiple calls to build() will always return the same websocket-instance.
     */
    public build(): Websocket {
        if (this.ws !== null)
            return this.ws;
        this.ws = new Websocket(this.url, this.protocols, this.buffer, this.backoff);
        if (this.onOpenChain !== null)
            this.ws.addEventListener(WebsocketEvents.open, this.onOpenChain);
        if (this.onCloseChain !== null)
            this.ws.addEventListener(WebsocketEvents.close, this.onCloseChain);
        if (this.onErrorChain !== null)
            this.ws.addEventListener(WebsocketEvents.error, this.onErrorChain);
        if (this.onMessageChain !== null)
            this.ws.addEventListener(WebsocketEvents.message, this.onMessageChain);
        if (this.onRetryChain !== null)
            this.ws.addEventListener(WebsocketEvents.retry, this.onRetryChain);
        return this.ws;
    }
}