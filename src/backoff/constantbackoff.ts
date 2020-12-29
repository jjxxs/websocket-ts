import {Backoff} from "./backoff";

/**
 * ConstantBackoff always returns the same value.
 */
export class ConstantBackoff implements Backoff {
    private readonly backoff: number;

    constructor(backoff: number) {
        this.backoff = backoff;
    }

    next(): number {
        return this.backoff;
    }

    reset = () => {
        // no-op
    }
}
