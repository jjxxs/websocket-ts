/**
 * Backoff is a series of numbers that are used to determine
 * the delay between connection-retries. Values are expected
 * to be in milliseconds.
 */
export interface Backoff {
    /**
     * Current number in the series.
     * @return the current number
     */
    current(): number

    /**
     * Advances the series to the next number and returns it.
     * @return the next number
     */
    next(): number

    /**
     * Resets the series to its initial state.
     */
    reset(): void
}
