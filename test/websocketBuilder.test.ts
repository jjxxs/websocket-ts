import {WebsocketBuilder, LRUBuffer, ConstantBackoff} from "../src";

describe("Testsuite for WebsocketBuilder", () => {
    const url = "ws://localhost:42421";

    test("WebsocketBuilder should set protocols", () => {
        const sut = new WebsocketBuilder(url);
        const expected = ["p1", "p2", "p3"];
        sut.withProtocols(expected);
        const actual = sut['protocols'];
        expect(actual).toEqual(expected);
    });

    test("WebsocketBuilder should set backoff", () => {
        const sut = new WebsocketBuilder(url);
        const expected = new ConstantBackoff(100);
        sut.withBackoff(expected);
        const actual = sut['backoff'];
        expect(actual).toBe(expected);
    });

    test("WebsocketBuilder should set buffer", () => {
        const sut = new WebsocketBuilder(url);
        const expected = new LRUBuffer(10);
        sut.withBuffer(expected);
        const actual = sut['buffer'];
        expect(actual).toBe(expected);
    });

    test("WebsocketBuilder should return the same instance on every build()-call", () => {
        const sut = new WebsocketBuilder(url);
        const ws = sut.build();
        const ws2 = sut.build();
        expect(ws).toBe(ws2);
    });
});