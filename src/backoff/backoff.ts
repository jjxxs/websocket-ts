/**
 * A Backoff produces a series of numbers that are used to determine
 * the delay between connection-retries. Values are expected to be in milliseconds.
 */
export interface Backoff {
  /**
   * The number of retries. Starts at 0, increases by 1 for each call to next(). Resets to 0 when reset() is called.
   */
  readonly retries: number;

  /**
   * Current number in the series, i.e. the value that the next call to next() will return.
   */
  readonly current: number;

  /**
   * Returns the current number in the series and advances the series by one step.
   * @return the current number in the series
   */
  next(): number;

  /**
   * Resets the series to its initial state.
   */
  reset(): void;
}
