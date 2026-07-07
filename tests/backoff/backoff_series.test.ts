import { ExponentialBackoff, LinearBackoff } from "../../src";
import { describe, test, expect } from "vitest";

/**
 * Regression tests for the documented backoff series: the delays produced by
 * successive next() calls must match the series described in the class docs
 * and README examples, starting with the initial value (base * 2^0 / initial).
 */
describe("Testsuite for the documented backoff series", () => {
  describe("ExponentialBackoff", () => {
    test("next() should produce the documented series 1s, 2s, 4s, ..., 64s for ExponentialBackoff(1000, 6)", () => {
      const backoff = new ExponentialBackoff(1000, 6);
      const expected = [
        1000, 2000, 4000, 8000, 16000, 32000, 64000, 64000, 64000,
      ];
      const actual = expected.map(() => backoff.next());
      expect(actual).toEqual(expected);
    });

    test("first next() should equal the base", () => {
      expect(new ExponentialBackoff(1000).next()).toBe(1000);
      expect(new ExponentialBackoff(42).next()).toBe(42);
    });

    test("series should restart after reset()", () => {
      const backoff = new ExponentialBackoff(1000, 6);
      backoff.next();
      backoff.next();
      backoff.next();
      backoff.reset();
      expect(backoff.next()).toBe(1000);
      expect(backoff.next()).toBe(2000);
    });
  });

  describe("LinearBackoff", () => {
    test("next() should produce the documented series 0ms, 10s, 20s, ..., 60s for LinearBackoff(0, 10000, 60000)", () => {
      const backoff = new LinearBackoff(0, 10000, 60000);
      const expected = [
        0, 10000, 20000, 30000, 40000, 50000, 60000, 60000, 60000,
      ];
      const actual = expected.map(() => backoff.next());
      expect(actual).toEqual(expected);
    });

    test("first next() should equal the initial backoff", () => {
      expect(new LinearBackoff(0, 10000).next()).toBe(0);
      expect(new LinearBackoff(1000, 500).next()).toBe(1000);
    });

    test("series should restart after reset()", () => {
      const backoff = new LinearBackoff(0, 10000, 60000);
      backoff.next();
      backoff.next();
      backoff.next();
      backoff.reset();
      expect(backoff.next()).toBe(0);
      expect(backoff.next()).toBe(10000);
    });
  });
});
