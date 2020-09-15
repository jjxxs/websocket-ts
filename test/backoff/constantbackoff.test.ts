import {ConstantBackoff, ExponentialBackoff} from "../../src";

describe("Testsuite for ConstantBackoff", () => {
    const delay = 5;
    let backoff: ConstantBackoff;

    beforeEach(() => {
        backoff = new ConstantBackoff(delay);
    });

    test("ConstantBackoff should always return the same value", () => {
        for (let i = 0; i < 10; i++)
            expect(backoff.Next()).toBe(delay);
        backoff.Reset();
        for (let i = 0; i < 10; i++)
            expect(backoff.Next()).toBe(delay);
    });
})

describe("Testsuite for ExponentialBackoff", () => {
    const p = 0, expMin = 0, expMax = 0;
    let backoff: ExponentialBackoff;

    beforeEach(() => {
       backoff = new ExponentialBackoff(p, expMin, expMax);
    });

    test("ExponentialBackoff should increase exponentially", () => {

    });
})