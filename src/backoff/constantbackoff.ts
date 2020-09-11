import {Backoff} from "./backoff";

/**
 * ConstantBackoff always returns the same value.
 */
export class ConstantBackoff implements Backoff {
    private readonly backoff: number;

    constructor(backoff: number) {
        this.backoff = backoff;
    }

    Next(): number {
        return this.backoff;
    }

    Reset = () => {
        // no-op
    }
}
