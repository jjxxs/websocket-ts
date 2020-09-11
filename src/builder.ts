import {Backoff} from "./backoff/backoff";
import {Buffer} from "./buffer/buffer";
import {Websocket, WebsocketEvents} from "./websocket";

export class Builder {
    private readonly url: string;
    private protocols?: string | string[]
    private backoff?: Backoff
    private buffer?: Buffer<string | ArrayBufferLike | Blob | ArrayBufferView>
    private onOpenChain?: (instance: Websocket, ev: Event) => any;
    private onCloseChain?: (instance: Websocket, ev: CloseEvent) => any;
    private onErrorChain?: (instance: Websocket, ev: Event) => any;
    private onMessageChain?: (instance: Websocket, ev: MessageEvent) => any;

    constructor(url: string) {
        this.url = url;
    }

    public withProtocols(p: string | string[]): Builder {
        this.protocols = p;
        return this;
    }

    public withBackoff(backoff: Backoff): Builder {
        this.backoff = backoff;
        return this;
    }

    public withBuffer(buffer: Buffer<any>): Builder {
        this.buffer = buffer;
        return this;
    }

    public onOpen(fn: (instance: Websocket, ev: Event) => any): Builder {
        const onOpen = this.onOpenChain;
        this.onOpenChain = (instance: Websocket, ev2: Event) => {
            fn(instance, ev2);
            if (onOpen !== undefined)
                onOpen(instance, ev2);
        }
        return this;
    }

    public onClose(fn: (instance: Websocket, ev: CloseEvent) => any): Builder {
        const onClose = this.onCloseChain;
        this.onCloseChain = (instance: Websocket, ev2: CloseEvent) => {
            fn(instance, ev2);
            if (onClose !== undefined)
                onClose(instance, ev2);
        }
        return this;
    }

    public onError(fn: (instance: Websocket, ev: Event) => any): Builder {
        const onError = this.onErrorChain;
        this.onErrorChain = (instance: Websocket, ev2: Event) => {
            fn(instance, ev2);
            if (onError !== undefined)
                onError(instance, ev2);
        }
        return this;
    }

    public onMessage(fn: (instance: Websocket, ev: MessageEvent) => any): Builder {
        const onMessage = this.onMessageChain;
        this.onMessageChain = (instance: Websocket, ev2: MessageEvent) => {
            fn(instance, ev2);
            if (onMessage !== undefined)
                onMessage(instance, ev2);
        }
        return this;
    }

    public build(): Websocket {
        const ws = new Websocket(this.url, this.protocols, this.buffer, this.backoff);
        if (this.onOpenChain !== undefined)
            ws.addEventListener(WebsocketEvents.open, this.onOpenChain);
        if (this.onCloseChain !== undefined)
            ws.addEventListener(WebsocketEvents.close, this.onCloseChain);
        if (this.onErrorChain !== undefined)
            ws.addEventListener(WebsocketEvents.error, this.onErrorChain);
        if (this.onMessageChain !== undefined)
            ws.addEventListener(WebsocketEvents.message, this.onMessageChain);
        return ws;
    }
}