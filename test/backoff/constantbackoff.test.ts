import {ConstantBackoff} from "../../src";

describe("Testsuite for ConstantBackoff", () => {

    test("Initialization should throw on negative backoff", () => {
        expect(() => new ConstantBackoff(-1001)).toThrow()
        expect(() => new ConstantBackoff(-42)).toThrow()
        expect(() => new ConstantBackoff(-1)).toThrow()
    })

    test("Initialization should not throw on zero backoff", () => {
        expect(() => new ConstantBackoff(0)).not.toThrow()
    })

    test("Initialization should not throw on positive backoff", () => {
        expect(() => new ConstantBackoff(1)).not.toThrow()
        expect(() => new ConstantBackoff(42)).not.toThrow()
        expect(() => new ConstantBackoff(1001)).not.toThrow()
    })

    test("Backoff should be equal to the given backoff", () => {
        expect(new ConstantBackoff(1).current()).toBe(1)
        expect(new ConstantBackoff(42).current()).toBe(42)
        expect(new ConstantBackoff(1001).current()).toBe(1001)
    })

    test("Backoff should be equal to the given backoff after next", () => {
        const backoff = new ConstantBackoff(42)
        backoff.next()
        expect(backoff.current()).toBe(42)
    })

    test("Backoff should be equal to the given backoff after reset", () => {
        const backoff = new ConstantBackoff(42)
        backoff.next()
        backoff.reset()
        expect(backoff.current()).toBe(42)
    })
})