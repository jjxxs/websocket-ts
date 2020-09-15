import {Buffer} from "./buffer";

/**
 * TimeBuffer keeps the elements that were written to the buffer
 * within maxAge milliseconds. E.g. to only keep items in the
 * buffer that are less than a minute old, create the buffer with
 * a maximum age of 60.000.
 */
export class TimeBuffer<E> implements Buffer<E> {
    private readonly maxAge: number;
    private tail?: elementWithTimestamp<E>;
    private head?: elementWithTimestamp<E>;

    constructor(maxAge: number) {
        this.maxAge = maxAge;
    }

    Cap(): number {
        return Number.POSITIVE_INFINITY;
    }

    Len(): number {
        let cur = this.tail;
        let i = 0;
        while (cur !== undefined) {
            i++;
            cur = cur.n;
        }
        return i;
    }

    Read(es: E[]): number {
        this.forwardTail();
        if (es.length === 0)
            return 0;
        let cur = this.tail;
        let i = 0;
        while (cur !== undefined) {
            es[i++] = cur.e;
            if (i === es.length)
                break;
            cur = cur.n;
        }
        return i;
    }

    Write(es: E[]): number {
        for (let i = 0; i < es.length; i++)
            this.putElement(es[i]);
        return es.length;
    }

    forEach(fn: (e: E) => any): number {
        this.forwardTail();
        let cur = this.tail;
        let i = 0;
        while (cur !== undefined) {
            fn(cur.e);
            i++;
            cur = cur.n;
        }
        return i;
    }

    private putElement(e: E) {
        const newElement = {e, t: Date.now(), n: undefined} as elementWithTimestamp<E>;
        if (this.tail === undefined)
            this.tail = newElement;
        if (this.head === undefined)
            this.head = newElement
        else {
            this.head.n = newElement;
            this.head = newElement;
        }
    }

    private forwardTail() {
        if (this.tail === undefined)
            return;
        const d = Date.now();
        while (d - this.tail.t > this.maxAge) {
            if (this.tail === this.head) {
                this.tail = undefined;
                this.head = undefined;
            } else
                this.tail = this.tail.n;
            if (this.tail === undefined)
                break;
        }
    }
}

type elementWithTimestamp<E> = {
    e: E,
    t: number,
    n?: elementWithTimestamp<E>
}