import {LRUBuffer} from "../../src";

describe("Testsuite for LRUBuffer", () => {
    const capacity = 5;

    test("LRUBuffer should return correct capacity", () => {
        const sut = new LRUBuffer<number>(capacity);
        expect(sut.cap()).toBe(capacity);
    })

    test("LRUBuffer should return correct length", () => {
        const sut = new LRUBuffer<number>(capacity);
        expect(sut.len()).toBe(0);
        for (let i = 0; i <= 2 * capacity; i++) {
            expect(sut.write([i])).toBe(1);
            expect(sut.len()).toBe(i >= capacity ? capacity : i + 1);
        }
    });

    test("LRUBuffer read/write zero elements", () => {
        const sut1 = new LRUBuffer<number>(capacity);
        const writeArr1 = createSequentialArray(0);
        const readArr1 = createEmptyArray(0);
        expect(sut1.write(writeArr1)).toBe(writeArr1.length);
        expect(sut1.len()).toBe(writeArr1.length);
        expect(sut1.read(readArr1)).toBe(writeArr1.length);
        expect(readArr1).toEqual(writeArr1);
    });

    test("LRUBuffer read/write single elements", () => {
        const sut = new LRUBuffer<number>(capacity)
        const expected = [] as number[];
        for (let i = 0; i < capacity * 3 + 2; i++) {
            // write new element to buffer
            expect(sut.write([i])).toBe(1);
            expected.push(i);

            // drop the last written element from expected if we exceed capacity
            if (i > capacity - 1)
                expected.shift();

            // read actual elements
            const r = createEmptyArray(i);
            expect(sut.read(r)).toBe(i > capacity ? capacity : i);
            for (let j = 0; j < i; j++) {
                if (j > capacity - 1)
                    expect(r[j]).toBeUndefined();
                else
                    expect(r[j]).toBe(expected[j]);
            }
        }
    });

    test("LRUBuffer read/write multiple elements", () => {
        for (let i = 0; i < 2 * capacity; i++) {
            const sut = new LRUBuffer<number>(capacity);
            const writeArr = createSequentialArray(i);
            const readArr = createEmptyArray(i);
            expect(sut.write(writeArr)).toBe(i);
            expect(sut.read(readArr)).toBe(i > capacity ? capacity : i);
            for (let j = 0; j < i; j++) {
                if (j > capacity - 1)
                    expect(readArr[j]).toBeUndefined();
                else
                    expect(readArr[j]).toBe(writeArr[i > capacity ? j - (capacity - i) : j]);
            }
        }
    });

    test("LRUBuffer read/write on buffer with zero capacity should always return zero", () => {
        const sut = new LRUBuffer<number>(0);
        expect(sut.write([1])).toBe(0);
        expect(sut.read([0])).toBe(0);
    });

    test("LRUBuffer read from empty buffer should return zero elements", () => {
        const sut = new LRUBuffer<number>(capacity);
        const readArr = new Array<number>(capacity);
        expect(sut.read(readArr)).toBe(0);
    });

    test("LRUBuffer forEach should apply function to every element in the buffer", () => {
       const sut = new LRUBuffer<number>(capacity);
       const es = [] as number[];
       sut.write([0]);
       sut.forEach(e => es.push(e));
       expect(es).toEqual([0]);

       const es2 = [] as number[];
       sut.write([1, 2, 3, 4]);
       sut.forEach(e => es2.push(e));
       expect(es2).toEqual([0, 1, 2, 3, 4]);

        const es3 = [] as number[];
        sut.write([5, 6]);
        sut.forEach(e => es3.push(e));
        expect(es3).toEqual([2, 3, 4, 5, 6]);
    });

    test("LRUBuffer forEach on empty buffer should do nothing", () => {
        const sut = new LRUBuffer<number>(capacity);
        const es = [] as number[];
        sut.forEach(e => es.push(e));
        expect(es.length).toBe(0);
    });

    test("LRUBuffer should contain zero items when cleared", () => {
        const sut = new LRUBuffer<number>(capacity);
        const writeArr = createSequentialArray(capacity);
        const readArr = createEmptyArray(capacity);
        sut.write(writeArr);
        sut.clear();
        expect(sut.len()).toBe(0);
        expect(sut.read(readArr)).toBe(0);
        expect(readArr).toEqual(createEmptyArray(capacity));
    });
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
