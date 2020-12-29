import {Backoff} from "./backoff";

/**
 * LinearBackoff increases the backoff-time by a constant number with
 * every step. An optional maximum can be provided as an upper bound
 * to the returned backoff.
 *
 * Example: for initial=0, increment=2000, maximum=8000 the Linear-
 * Backoff will produce the series [0, 2000, 4000, 6000, 8000].
 */
export class LinearBackoff implements Backoff {
    private readonly initial: number;
    private readonly increment: number;
    private readonly maximum?: number;
    private current: number;

    constructor(initial: number, increment: number, maximum?: number) {
        this.initial = initial;
        this.increment = increment;
        this.maximum = maximum;
        this.current = this.initial;
    }

    next() {
        const backoff = this.current;
        const next = this.current + this.increment;
        if (this.maximum === undefined)
            this.current = next;
        else if (next <= this.maximum)
            this.current = next;
        return backoff;
    }

    reset() {
        this.current = this.initial;
    }
}
