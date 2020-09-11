import {Backoff} from "./backoff";

export class LinearBackoff implements Backoff {
    private readonly p: number;
    private readonly kMax?: number;
    private k: number = 1;

    constructor(p: number, kMax?: number) {
        this.p = p;
        this.kMax = kMax;
    }

    Next() {
        const next = this.k * this.p;
        if (this.kMax === undefined)
            this.k++;
        else if (this.kMax > this.k)
            this.k++;
        return next;
    }

    Reset() {
        this.k = 0;
    }
}
