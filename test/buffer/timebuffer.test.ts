import {TimeBuffer} from "../../src";
import {createEmptyArray, createSequentialArray} from "./common";

describe("Testsuite for TimeBuffer", () => {
    const maxAge = 1000;
    let tb: TimeBuffer<number>;

    beforeEach(() => {
        tb = new TimeBuffer<number>(maxAge); // no older than 1000 ms
    });

    test("TimeBuffer length", async () => {
        expect(tb.len()).toBe(0);
        for (let i = 0; i < 10; i++) {
            expect(tb.write([i])).toBe(1);
            expect(tb.len()).toBe(i + 1);
        }

        await delay(maxAge + 500).then(() => {
            expect(tb.len()).toBe(0);
        });
    });

    test("TimeBuffer capacity", () => {
        expect(tb.cap()).toBe(Number.POSITIVE_INFINITY);
    });

    test("TimeBuffer elements should expire when they reach their maxAge", async () => {
        // add 10 items
        for (let i = 0; i < 10; i++) {
            expect(tb.write([i])).toBe(1);
            expect(tb.len()).toBe(i + 1);
        }

        // give elements some time to "age"
        await delay(500).then(() => {

            // all items should still be in range
            expect(tb.len()).toBe(10);

            // add 10 more items
            for (let i = 0; i < 5; i++) {
                expect(tb.write([i])).toBe(1);
                expect(tb.len()).toBe(10 + i + 1);
            }
        });

        // the first 10 items should now be removed, there are 5 items remaining
        await delay(800).then(() => {
            expect(tb.len()).toBe(5);
        });
    });

    test("TimeBuffer read should return items up to maxAge ", async () => {
        const w1 = createSequentialArray(10);
        expect(tb.write(w1)).toBe(10);
        const r1 = createEmptyArray(10);
        expect(tb.read(r1)).toBe(10);
        for (let i = 0; i < 10; i++)
            expect(w1[i]).toBe(r1[i]);

        await delay(500).then(() => {
            const r2 = createEmptyArray(10);
            expect(tb.read(r2)).toBe(10);
            for (let i = 0; i < 10; i++)
                expect(w1[i]).toBe(r2[i]);

            const w2 = createSequentialArray(5);
            expect(tb.write(w2)).toBe(5);
            const r3 = createEmptyArray(15);
            expect(tb.read(r3)).toBe(15);
            for (let i = 0; i < 15; i++)
                if (i < 10)
                    expect(r3[i]).toBe(w1[i]);
                else
                    expect(r3[i]).toBe(w2[i - 10]);
        });
    });

    test("TimeBuffer read on empty should return no item", () => {
        const r1 = createEmptyArray(10);
        expect(tb.read(r1)).toBe(0);
        expect(tb.read([])).toBe(0);
    });

    test("TimeBuffer forEach() should only be invoked on valid items", async () => {
        const w1 = createSequentialArray(10);
        expect(tb.write(w1)).toBe(10);
        const r2 = [] as number[];
        tb.forEach(e => r2.push(e));
        expect(r2.length).toBe(10);

        await delay(500).then(() => {
            const w2 = createSequentialArray(5);
            expect(tb.write(w2)).toBe(5);
            const r3 = [] as number[]
            tb.forEach(e => r3.push(e));
            expect(r3.length).toBe(15);
        });

        await delay(800).then(() => {
            const r4 = [] as number[];
            tb.forEach(e => r4.push(e));
            expect(r4.length).toBe(5);
        })
    })
});

function delay(ms: number): Promise<void> {
    return new Promise<void>(resolve => {
        setTimeout(() => {
            resolve();
        }, ms);
    })
}