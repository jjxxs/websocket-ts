/**
 * Backoff provides a series of numbers. This series follows
 * a concrete pattern, e.g. be constant, linearly increasing,
 * exponentially increasing etc.
 */
export interface Backoff {
    /**
     * Provides the callee with the next number in the
     * series.
     * @return the next number
     */
    next(): number

    /**
     *  Resets the series to its starting-value.
     */
    reset(): void
}
