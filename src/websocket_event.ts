import { Websocket } from "./websocket";

/**
 * Events that can be fired by the websocket.
 */
export enum WebsocketEvent {
  /** Fired when the connection is opened. */
  open = "open",

  /** Fired when the connection is closed. */
  close = "close",

  /** Fired when the connection has been closed because of an error, such as when some data couldn't be sent. */
  error = "error",

  /** Fired when a message is received. */
  message = "message",

  /** Fired when the websocket tries to reconnect after a connection loss. */
  retry = "retry",

  /** Fired when the websocket successfully reconnects after a connection loss. */
  reconnect = "reconnect",
}

/***
 * Details/properties of a retry-event.
 */
export type RetryEventDetail = {
  /** Number of retries that have been made since the connection was lost. */
  readonly retries: number;

  /** Time (ms) waited since the last connection-retry. */
  readonly backoff: number;

  /** Timestamp of when the connection was lost or undefined if the connection has never been established. */
  readonly lastConnection: Date | undefined;
};

/**
 * Properties of a reconnect-event.
 */
export type ReconnectEventDetail = Omit<RetryEventDetail, "backoff">;

/**
 * Maps websocket events to their corresponding event.
 */
export type WebsocketEventMap = {
  [WebsocketEvent.open]: Event;
  [WebsocketEvent.close]: CloseEvent;
  [WebsocketEvent.error]: Event;
  [WebsocketEvent.message]: MessageEvent;
  [WebsocketEvent.retry]: CustomEvent<RetryEventDetail>;
  [WebsocketEvent.reconnect]: CustomEvent<ReconnectEventDetail>;
};

/**
 * Listener for websocket events.
 * */
export type WebsocketEventListener<K extends WebsocketEvent> = (
  instance: Websocket,
  ev: WebsocketEventMap[K],
) => unknown;

export type WebsocketEventListenerParams<K extends WebsocketEvent> = Parameters<
  WebsocketEventListener<K>
>;

/**
 * Options for websocket events.
 */
export type WebsocketEventListenerOptions = EventListenerOptions &
  AddEventListenerOptions;

/**
 * Listener for websocket events with options.
 */
export type WebsocketEventListenerWithOptions<K extends WebsocketEvent> = {
  readonly listener: WebsocketEventListener<K>;
  readonly options?: WebsocketEventListenerOptions;
};

/**
 * Maps websocket events to their corresponding event-listeners.
 */
export type WebsocketEventListeners = {
  [K in WebsocketEvent]: WebsocketEventListenerWithOptions<K>[];
};
