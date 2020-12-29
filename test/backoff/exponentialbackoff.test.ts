import {ExponentialBackoff} from "../../src/";

describe("Testsuite for ExponentialBackoff", () => {
    test("ExponentialBackoff should produce an exponentially increasing series", () => {
        const sut = new ExponentialBackoff(100, 7);
        const expected = [100, 200, 400, 800, 1600, 3200, 6400, 6400, 6400, 6400];
        for (let i = 0; i < expected.length; i++)
            expect(sut.next()).toBe(expected[i]);
        sut.reset()
        for (let i = 0; i < expected.length; i++)
            expect(sut.next()).toBe(expected[i]);
    });
});