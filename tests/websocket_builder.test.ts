import {WebsocketBuilder, LRUBuffer, ConstantBackoff} from "../src";

describe("Testsuite for Websocket_builder", () => {
    const url = "ws://localhost:42421";

    test("Websocket_builder should set protocols", () => {
        const sut = new WebsocketBuilder(url);
        const expected = ["p1", "p2", "p3"];
        sut.withProtocols(expected);
        const actual = sut['protocols'];
        expect(actual).toEqual(expected);
    });

    test("Websocket_builder should set backoff", () => {
        const sut = new WebsocketBuilder(url);
        const expected = new ConstantBackoff(100);
        sut.withBackoff(expected);
        const actual = sut['backoff'];
        expect(actual).toBe(expected);
    });

    test("Websocket_builder should set queue", () => {
        const sut = new WebsocketBuilder(url);
        const expected = new LRUBuffer<string>(10);
        sut.withBuffer(expected);
        const actual = sut['buffer'];
        expect(actual).toBe(expected);
    });

    test("Websocket_builder should return the same instance on every build()-call", () => {
        const sut = new WebsocketBuilder(url);
        const ws = sut.build();
        const ws2 = sut.build();
        expect(ws).toBe(ws2);
    });
});