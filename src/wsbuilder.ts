import {Backoff} from "./backoff/backoff";
import {Buffer} from "./buffer/buffer";
import {RetryEventDetails, Websocket, WebsocketEvents} from "./websocket";

export class WsBuilder {
    private readonly url: string;
    private protocols?: string | string[]
    private backoff?: Backoff
    private buffer?: Buffer<string | ArrayBufferLike | Blob | ArrayBufferView>
    private onOpenChain?: (instance: Websocket, ev: Event) => any;
    private onCloseChain?: (instance: Websocket, ev: CloseEvent) => any;
    private onErrorChain?: (instance: Websocket, ev: Event) => any;
    private onMessageChain?: (instance: Websocket, ev: MessageEvent) => any;
    private onRetryChain?: (instance: Websocket, ev: CustomEvent<RetryEventDetails>) => any;
    private ws?: Websocket;

    constructor(url: string) {
        this.url = url;
    }

    public withProtocols(p: string | string[]): WsBuilder {
        this.protocols = p;
        return this;
    }

    public withBackoff(backoff: Backoff): WsBuilder {
        this.backoff = backoff;
        return this;
    }

    public withBuffer(buffer: Buffer<any>): WsBuilder {
        this.buffer = buffer;
        return this;
    }

    public onOpen(fn: (instance: Websocket, ev: Event) => any): WsBuilder {
        const onOpen = this.onOpenChain;
        this.onOpenChain = (instance: Websocket, ev2: Event) => {
            fn(instance, ev2);
            if (onOpen !== undefined)
                onOpen(instance, ev2);
        }
        return this;
    }

    public onClose(fn: (instance: Websocket, ev: CloseEvent) => any): WsBuilder {
        const onClose = this.onCloseChain;
        this.onCloseChain = (instance: Websocket, ev2: CloseEvent) => {
            fn(instance, ev2);
            if (onClose !== undefined)
                onClose(instance, ev2);
        }
        return this;
    }

    public onError(fn: (instance: Websocket, ev: Event) => any): WsBuilder {
        const onError = this.onErrorChain;
        this.onErrorChain = (instance: Websocket, ev2: Event) => {
            fn(instance, ev2);
            if (onError !== undefined)
                onError(instance, ev2);
        }
        return this;
    }

    public onMessage(fn: (instance: Websocket, ev: MessageEvent) => any): WsBuilder {
        const onMessage = this.onMessageChain;
        this.onMessageChain = (instance: Websocket, ev2: MessageEvent) => {
            fn(instance, ev2);
            if (onMessage !== undefined)
                onMessage(instance, ev2);
        }
        return this;
    }

    public onRetry(fn: (instance: Websocket, ev: CustomEvent<RetryEventDetails>) => any): WsBuilder {
        const onRetry = this.onRetryChain;
        this.onRetryChain = (instance: Websocket, ev2: CustomEvent<RetryEventDetails>) => {
            fn(instance, ev2);
            if (onRetry !== undefined)
                onRetry(instance, ev2);
        }
        return this;
    }

    /**
     * Multiple calls to build() will always return the same websocket-instance.
     */
    public build(): Websocket {
        if (this.ws !== undefined)
            return this.ws;
        this.ws = new Websocket(this.url, this.protocols, this.buffer, this.backoff);
        if (this.onOpenChain !== undefined)
            this.ws.addEventListener(WebsocketEvents.open, this.onOpenChain);
        if (this.onCloseChain !== undefined)
            this.ws.addEventListener(WebsocketEvents.close, this.onCloseChain);
        if (this.onErrorChain !== undefined)
            this.ws.addEventListener(WebsocketEvents.error, this.onErrorChain);
        if (this.onMessageChain !== undefined)
            this.ws.addEventListener(WebsocketEvents.message, this.onMessageChain);
        if (this.onRetryChain !== undefined)
            this.ws.addEventListener(WebsocketEvents.retry, this.onRetryChain);
        return this.ws;
    }
}