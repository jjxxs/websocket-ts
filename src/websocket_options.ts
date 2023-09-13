import { WebsocketBuffer } from "./websocket_buffer";
import { WebsocketConnectionRetryOptions } from "./websocket_retry_options";
import { WebsocketEventListeners } from "./websocket_event";

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
   * The initial listeners to add to the websocket.
   */
  readonly listeners?: WebsocketEventListeners;
}
