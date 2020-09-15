import {WsBuilder, LRUBuffer, Websocket} from "../src";
import {ConstantBackoff} from "../src/backoff/constantbackoff";

describe("Testsuite for Builder", () => {
    const url = "ws://localhost:42421";
    let builder: WsBuilder

    beforeEach(() => {
        builder = new WsBuilder(url);
    });

    test("Builder should set protocols", () => {
        const protocols = ["p1", "p2", "p3"];
        builder.withProtocols(protocols);
        expect(builder["protocols"]).toBe(protocols);
    });

    test("Builder should set backoff", () => {
        const backoff = new ConstantBackoff(100);
        builder.withBackoff(backoff);
        expect(builder["backoff"]).toBe(backoff);
    });

    test("Builder should set buffer", () => {
        const buffer = new LRUBuffer(10);
        builder.withBuffer(buffer);
        expect(builder["buffer"]).toBe(buffer);
    });

    test("Builder should set onOpen-callbacks", () => {
        let i = 0;
        const cb1 = () => i += 2
        const cb2 = () => i += 3
        builder.onOpen(cb1).onOpen(cb2);
        const fns = builder["onOpenChain"]
        expect(fns).not.toBeUndefined();
        fns!(null as unknown as Websocket, null as unknown as Event);
        expect(i).toBe(5);
    })
});