import {ExponentialBackoff} from "../../src/backoff/exponentialbackoff";

describe("Testsuite for ExponentialBackoff", () => {
    const k = 0, expMin = 0, expMax = 8;
    let backoff: ExponentialBackoff;

    beforeEach(() => {
       backoff = new ExponentialBackoff(k, expMin, expMax);
    });

    test("ExponentialBackoff should increase exponentially", () => {
        let expCur = expMin;
        const calc = (): number => {
            const next = k * Math.pow(2, expCur);
            if (expMax > expCur)
                expCur++;
            return next;
        }
        for (let i = 0; i < expMax + 5; i++)
            expect(backoff.Next()).toBe(calc());
        backoff.Reset()
        expCur = expMin;
        for (let i = 0; i < expMax + 5; i++)
            expect(backoff.Next()).toBe(calc());
    });
});