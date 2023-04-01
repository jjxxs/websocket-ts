import {Backoff} from "./backoff"


/**
 * ConstantBackoff always returns the same backoff-time.
 */
export class ConstantBackoff implements Backoff {
    private readonly backoff: number

    /**
     * Creates a new ConstantBackoff.
     * @param backoff the backoff-time to return
     */
    constructor(backoff: number) {
        if (backoff < 0) {
            throw new Error("backoff must be >= 0")
        }

        this.backoff = backoff
    }

    current(): number {
        return this.backoff
    }

    next(): number {
        return this.backoff
    }

    reset = () => {
        // nothing to do
    }
}
