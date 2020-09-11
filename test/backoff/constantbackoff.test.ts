import {ConstantBackoff} from "../../src/backoff/constantbackoff";

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