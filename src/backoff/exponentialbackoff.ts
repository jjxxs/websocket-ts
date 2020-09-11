import {Backoff} from "./backoff";

/**
 * ExponentialBackoff doubles the backoff with every step until
 * a maximum is reached. This is modelled after the binary exponential-
 * backoff algorithm used in computer-networking.
 *
 * With every step s, the result is doubled. The calculation-specification
 * is: b = k * 2^s with s in [expMin, expMax].
 *
 * Example: k=100, expMin=0, expMax=7 will produce the series
 * [100, 200, 400, 800, 1600, 3200, 6400]
 */
export class ExponentialBackoff implements Backoff {
    private readonly k: number;
    private readonly expMin: number;
    private readonly expMax: number;
    private expCur: number;

    constructor(k: number, expMin: number, expMax: number) {
        this.k = k;
        this.expMin = expMin;
        this.expMax = expMax;
        this.expCur = expMin;
    }

    Next(): number {
        const next = this.k * Math.pow(2, this.expCur);
        if (this.expMax > this.expCur)
            this.expCur++;
        return next;
    }

    Reset() {
        this.expCur = this.expMin;
    }
}