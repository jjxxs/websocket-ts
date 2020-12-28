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

    test("WebsocketBuilder should call onOpen-callbacks in stack-order", () => {
        const sut = new WebsocketBuilder(url);
        const actual = [] as number[];
        const expected = [4, 3, 2, 1, 0];
        for (let i = 0; i < expected.length; i++) {
            sut.onOpen(() => {
                actual.push(i);
            });
        }
        sut['onOpenChain']!(null!, null!);
        expect(actual).toEqual(expected);
    });

    test("WebsocketBuilder should call onClose-callbacks in stack-order", () => {
        const sut = new WebsocketBuilder(url);
        const actual = [] as number[];
        const expected = [4, 3, 2, 1, 0];
        for (let i = 0; i < expected.length; i++) {
            sut.onClose(() => {
                actual.push(i);
            });
        }
        sut['onCloseChain']!(null!, null!);
        expect(actual).toEqual(expected);
    });

    test("WebsocketBuilder should call onError-callbacks in stack-order", () => {
        const sut = new WebsocketBuilder(url);
        const actual = [] as number[];
        const expected = [4, 3, 2, 1, 0];
        for (let i = 0; i < expected.length; i++) {
            sut.onError(() => {
                actual.push(i);
            });
        }
        sut['onErrorChain']!(null!, null!);
        expect(actual).toEqual(expected);
    });

    test("WebsocketBuilder should call onMessage-callbacks in stack-order", () => {
        const sut = new WebsocketBuilder(url);
        const actual = [] as number[];
        const expected = [4, 3, 2, 1, 0];
        for (let i = 0; i < expected.length; i++) {
            sut.onMessage(() => {
                actual.push(i);
            });
        }
        sut['onMessageChain']!(null!, null!);
        expect(actual).toEqual(expected);
    });

    test("WebsocketBuilder should call onRetry-callbacks in stack-order", () => {
        const sut = new WebsocketBuilder(url);
        const actual = [] as number[];
        const expected = [4, 3, 2, 1, 0];
        for (let i = 0; i < expected.length; i++) {
            sut.onRetry(() => {
                actual.push(i);
            });
        }
        sut['onRetryChain']!(null!, null!);
        expect(actual).toEqual(expected);
    });

    test("WebsocketBuilder should return the same instance on every build()-call", () => {
        const sut = new WebsocketBuilder(url);
        const ws = sut.build();
        const ws2 = sut.build();
        expect(ws).toBe(ws2);
    });
});