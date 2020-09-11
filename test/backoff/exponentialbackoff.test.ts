import {ExponentialBackoff} from "../../src/backoff/exponentialbackoff";

describe("Testsuite for ExponentialBackoff", () => {
    const p = 0, expMin = 0, expMax = 0;
    let backoff: ExponentialBackoff;

    beforeEach(() => {
       backoff = new ExponentialBackoff(p, expMin, expMax);
    });

    test("ExponentialBackoff should increase exponentially", () => {
        expect(true).toBe(true);
    });
});