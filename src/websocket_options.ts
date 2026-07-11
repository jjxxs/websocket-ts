import { WebsocketBuffer } from "./websocket_buffer.js";
import { WebsocketConnectionRetryOptions } from "./websocket_retry_options.js";
import { WebsocketEventListeners } from "./websocket_event.js";

/**
 * Options that can be passed to the Websocket constructor.
 */
export interface WebsocketOptions {
  /**
   * The Buffer to use.
   */
  readonly buffer?: WebsocketBuffer;

  /**
   * The options for the connection-retry-strategy.
   */
  readonly retry?: WebsocketConnectionRetryOptions;

  /**
   * The initial listeners to add to the websocket. Event-types without
   * listeners can be omitted.
   */
  readonly listeners?: Partial<WebsocketEventListeners>;
}
