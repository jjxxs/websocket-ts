import { Backoff } from "./backoff/backoff.js";

/**
 * Options for the websockets retry-strategy.
 */
export interface WebsocketConnectionRetryOptions {
  /**
   * The maximum number of retries before giving up. No limit if undefined.
   * Must be a non-negative integer; zero means no retry is ever made.
   */
  readonly maxRetries?: number;

  /**
   * Whether to reconnect immediately after a connection has been lost,
   * ignoring the backoff strategy for the first retry.
   */
  readonly instantReconnect?: boolean;

  /**
   * The backoff strategy to use. This is used to determine the delay between connection-retries.
   */
  readonly backoff?: Backoff;
}
