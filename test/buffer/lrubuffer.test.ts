import {LRUBuffer} from "../../src";

describe("Testsuite for LRUBuffer", () => {
    const cap = 5;
    let lru: LRUBuffer<number>;

    beforeEach(() => {
        lru = new LRUBuffer<number>(cap);
    });

    test("LRUBuffer length", () => {
        expect(lru.Len()).toBe(0);
        for (let i = 0; i < 2 * cap; i++) {
            expect(lru.Write([0])).toBe(1);
            expect(lru.Len()).toBe(i >= cap ? cap : i + 1);
        }
    });

    test("LRUBuffer capacity", () => {
        expect(lru.Cap()).toBe(cap);
    })

    test("LRUBuffer read/write", () => {
        for (let i = 0; i < 2 * cap; i++) {
            lru = new LRUBuffer<number>(cap);
            const w1 = createSequentialArray(i);
            expect(lru.Write(w1)).toBe(i);
            const r1 = createEmptyArray(i);
            expect(lru.Read(r1)).toBe(i > cap ? cap : i);
            for (let j = 0; j < i; j++) {
                if (j > cap - 1)
                    expect(r1[j]).toBeUndefined();
                else
                    expect(r1[j]).toBe(w1[i > cap ? j - (cap - i) : j]);
            }
        }
    });

    test("LRUBuffer read/write single elements", () => {
        const shouldBe = [] as number[];
        for (let i = 0; i < cap * 2; i++) {
            const w = [i];
            expect(lru.Write(w)).toBe(1);
            shouldBe.push(i);
            if (i > cap - 1)
                shouldBe.shift();
            const r = createEmptyArray(i);
            expect(lru.Read(r)).toBe(i > cap ? cap : i);
            for (let j = 0; j < i; j++) {
                if (j > cap - 1)
                    expect(r[j]).toBeUndefined();
                else
                    expect(r[j]).toBe(shouldBe[j]);
            }
        }
    })

    test("LRUBuffer read/write smaller chunk", () => {
        const oneLessThanCap = cap - 1;
        const w1 = createSequentialArray(oneLessThanCap);
        expect(lru.Write(w1)).toBe(oneLessThanCap);
        for (let i = 0; i < oneLessThanCap; i++) {
            const r1 = createEmptyArray(i);
            expect(lru.Read(r1)).toBe(i);
            for (let j = 0; j < i; j++) {
                if (j > oneLessThanCap - 1)
                    expect(r1[j]).toBeUndefined();
                else
                    expect(r1[j]).toBe(w1[j]);
            }
        }
    });

    test("LRUBuffer read/write smaller chunk when wrapped", () => {
        const w1 = createSequentialArray(cap);
        expect(lru.Write(w1)).toBe(cap);
        for (let i = 0; i < cap; i++) {
            const r1 = createEmptyArray(i);
            expect(lru.Read(r1)).toBe(i);
            for (let j = 0; j < i; j++) {
                if (j > cap - 1)
                    expect(r1[j]).toBeUndefined();
                else
                    expect(r1[j]).toBe(w1[j]);
            }
        }
    });

    test("LRUBuffer multiple read/write", () => {
        const w1 = createSequentialArray(cap - 1);
        expect(lru.Write(w1)).toBe(cap - 1);
        const r1 = createSequentialArray(cap - 1);
        expect(lru.Read(r1)).toBe(cap - 1);
        for (let i = 0; i < cap - 1; i++) {
            expect(w1[i]).toBe(r1[i]);
        }
        const w2 = createSequentialArray(2);
        expect(lru.Write(w2)).toBe(2);
        const r2 = createEmptyArray(cap);
        expect(lru.Read(r2)).toBe(cap);
    });

    test("LRUBuffer forEach should apply function to every element in the buffer", () => {
        const w1 = [0];
        expect(lru.Write(w1)).toBe(w1.length);
        const res = [] as number[];
        lru.forEach((e) => res.push(e));
        expect(res.length).toBe(w1.length);
        for (let i = 0; i < w1.length; i++) {
            expect(res[i]).toBe(w1[i]);
        }
        const w2 = [1, 2, 3, 4];
        const expected2 = [0, 1, 2, 3, 4];
        expect(lru.Write(w2)).toBe(w2.length);
        const res2 = [] as number[];
        lru.forEach((e) => res2.push(e));
        expect(res2.length).toBe(cap);
        for (let i = 0; i < cap; i++) {
            expect(res2[i]).toBe(expected2[i]);
        }
        const w3 = [5, 6];
        const expected3 = [2, 3, 4, 5, 6];
        expect(lru.Write(w3)).toBe(w3.length);
        const res3 = [] as number[];
        lru.forEach((e) => res3.push(e));
        expect(res3.length).toBe(cap);
        for (let i = 0; i < cap; i++) {
            expect(res3[i]).toBe(expected3[i]);
        }
    });

    test("LRUBuffer read/write on buffer with zero length should always return zero", () => {
        lru = new LRUBuffer<number>(0);
        expect(lru.Write([1])).toBe(0);
        expect(lru.Read([0])).toBe(0);
    });

    test("LRUBuffer read from buffer with no elements", () => {
        const lru = new LRUBuffer<number>(cap);
        const r1 = createEmptyArray(cap);
        expect(lru.Read(r1)).toBe(0);
    });

    test("LRUBuffer forEach on buffer with no elements", () => {
        const lru = new LRUBuffer<number>(cap);
        const es = [] as number[];
        lru.forEach(e => es.push(e));
        expect(es.length).toBe(0);
    })
});

const createEmptyArray = (len: number): Array<number> => {
    return new Array<number>(len);
}

const createSequentialArray = (len: number): Array<number> => {
    const arr = new Array<number>(len);
    for (let i = 0; i < arr.length; i++)
        arr[i] = i;
    return arr;
}
