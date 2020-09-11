export interface Backoff {
    Next(): number

    Reset(): void
}

export class ConstantBackoff implements Backoff {
    private readonly backoff: number;

    constructor(backoff: number) {
        this.backoff = backoff;
    }

    Next(): number {
        return this.backoff;
    }

    Reset = () => {
    }
}

export class ExponentialBackoff implements Backoff {
    private readonly p: number;
    private readonly expMin: number;
    private readonly expMax: number;
    private expCur: number;

    constructor(p: number, expMin: number, expMax: number) {
        this.p = p;
        this.expMin = expMin;
        this.expMax = expMax;
        this.expCur = expMin;
    }

    Next(): number {
        const next = this.p * Math.pow(2, this.expCur);
        if (this.expMax > this.expCur)
            this.expCur++;
        return next;
    }

    Reset() {
        this.expCur = this.expMin;
    }
}

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
