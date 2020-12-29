import {LinearBackoff} from "../../src";

describe("Testsuite for LinearBackoff", () => {
    test("LinearBackoff should produce a linearly increasing series starting with 0", () => {
        const sut = new LinearBackoff(0, 2000, 8000);
        const expected = [0, 2000, 4000, 6000, 8000, 8000, 8000, 8000, 8000, 8000];
        for (let i = 0; i < 10; i++)
            expect(sut.next()).toBe(expected[i]);
        sut.reset();
        for (let i = 0; i < 10; i++)
            expect(sut.next()).toBe(expected[i]);
    });

    test("LinearBackoff should produce a linearly increasing series starting with 1000", () => {
        const sut = new LinearBackoff(1000, 3000, 10000);
        const expected = [1000, 4000, 7000, 10000, 10000, 10000, 10000, 10000, 10000, 10000];
        for (let i = 0; i < 10; i++)
            expect(sut.next()).toBe(expected[i]);
        sut.reset();
        for (let i = 0; i < 10; i++)
            expect(sut.next()).toBe(expected[i]);
    });

    test("LinearBackoff with undefined maximum should increase without bounds", () => {
        const sut = new LinearBackoff(1000, 1000);
        for (let i = 0; i < 100; i++)
            expect(sut.next()).toBe(1000 + 1000 * i);
        sut.reset();
        for (let i = 0; i < 100; i++)
            expect(sut.next()).toBe(1000 + 1000 * i);
    })
})