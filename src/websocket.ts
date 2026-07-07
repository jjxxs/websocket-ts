import { Backoff } from "./backoff/backoff";
import { WebsocketBuffer } from "./websocket_buffer";
import {
  ExhaustedEventDetail,
  ReconnectEventDetail,
  RetryEventDetail,
  WebsocketEvent,
  WebsocketEventListener,
  WebsocketEventListenerOptions,
  WebsocketEventListeners,
  WebsocketEventListenerWithOptions,
  WebsocketEventMap,
} from "./websocket_event";
import { WebsocketOptions } from "./websocket_options";
import { WebsocketConnectionRetryOptions } from "./websocket_retry_options";

/**
 * A URL or a function that returns a URL. When a function is provided, it is called on each connection attempt,
 * enabling use cases like load balancing, auth token rotation, and failover.
 */
export type UrlProvider = string | (() => string);

/**
 * A websocket wrapper that can be configured to reconnect automatically and buffer messages when the websocket is not connected.
 */
export class Websocket {
  private readonly _urlProvider: UrlProvider; // the url or url provider
  private _url!: string; // the last resolved url
  private readonly _protocols?: string | string[]; // the protocols to use

  private _closedByUser: boolean = false; // whether the websocket was closed by the user
  private _lastConnection?: Date; // timestamp of the last connection
  private _binaryType?: BinaryType; // binaryType chosen by the user, undefined if never set
  private _underlyingWebsocket: WebSocket; // the underlying websocket, e.g. native browser websocket
  private retryTimeout?: ReturnType<typeof globalThis.setTimeout>; // timeout for the next retry, if any

  // options/config for the websocket; internally the retry options and the
  // listeners for every event-type are always present, even when the
  // user-supplied options omitted them
  private _options: Omit<WebsocketOptions, "listeners" | "retry"> & {
    readonly retry: WebsocketConnectionRetryOptions;
    readonly listeners: WebsocketEventListeners;
  };

  /**
   * Creates a new websocket.
   *
   * @param url to connect to, or a function that returns a URL.
   * @param protocols optional protocols to use.
   * @param options optional options to use.
   * @throws Error if retry options (maxRetries, instantReconnect) are set without a backoff.
   */
  constructor(
    url: UrlProvider,
    protocols?: string | string[],
    options?: WebsocketOptions,
  ) {
    if (
      options?.retry?.backoff === undefined &&
      (options?.retry?.maxRetries !== undefined ||
        options?.retry?.instantReconnect !== undefined)
    ) {
      // retrying is driven by the backoff; without one, the other retry options would silently do nothing
      throw new Error(
        "Retry options (maxRetries, instantReconnect) require a backoff to be configured",
      );
    }

    this._urlProvider = url;
    this._protocols = protocols;

    // make a copy of the options to prevent the user from changing them
    this._options = {
      buffer: options?.buffer,
      retry: {
        maxRetries: options?.retry?.maxRetries,
        instantReconnect: options?.retry?.instantReconnect,
        backoff: options?.retry?.backoff,
      },
      listeners: {
        open: [...(options?.listeners?.open ?? [])],
        close: [...(options?.listeners?.close ?? [])],
        error: [...(options?.listeners?.error ?? [])],
        message: [...(options?.listeners?.message ?? [])],
        retry: [...(options?.listeners?.retry ?? [])],
        reconnect: [...(options?.listeners?.reconnect ?? [])],
        exhausted: [...(options?.listeners?.exhausted ?? [])],
      },
    };

    this._underlyingWebsocket = this.tryConnect();
  }

  /**
   * Getter for the url.
   *
   * @return the url.
   */
  get url(): string {
    return this._url;
  }

  /**
   * Getter for the protocols.
   *
   * @return the protocols, or undefined if none were provided.
   */
  get protocols(): string | string[] | undefined {
    return this._protocols;
  }

  /**
   * Getter for the buffer.
   *
   * @return the buffer, or undefined if none was provided.
   */
  get buffer(): WebsocketBuffer | undefined {
    return this._options.buffer;
  }

  /**
   * Getter for the maxRetries.
   *
   * @return the maxRetries, or undefined if none was provided (no limit).
   */
  get maxRetries(): number | undefined {
    return this._options.retry.maxRetries;
  }

  /**
   * Getter for the instantReconnect.
   *
   * @return the instantReconnect, or undefined if none was provided.
   */
  get instantReconnect(): boolean | undefined {
    return this._options.retry.instantReconnect;
  }

  /**
   * Getter for the backoff.
   *
   * @return the backoff, or undefined if none was provided.
   */
  get backoff(): Backoff | undefined {
    return this._options.retry.backoff;
  }

  /**
   * Whether the websocket was closed by the user. A websocket is closed by the user by calling close().
   *
   * @return true if the websocket was closed by the user, false otherwise.
   */
  get closedByUser(): boolean {
    return this._closedByUser;
  }

  /**
   * Getter for the last 'open' event, e.g. the last time the websocket was connected.
   *
   * @return the last 'open' event, or undefined if the websocket was never connected.
   */
  get lastConnection(): Date | undefined {
    return this._lastConnection;
  }

  /**
   * Getter for the underlying websocket. This can be used to access the browser's native websocket directly.
   *
   * @see https://developer.mozilla.org/en-US/docs/Web/API/WebSocket
   * @return the underlying websocket.
   */
  get underlyingWebsocket(): WebSocket {
    return this._underlyingWebsocket;
  }

  /**
   * Getter for the readyState of the underlying websocket.
   *
   * @see https://developer.mozilla.org/en-US/docs/Web/API/WebSocket/readyState
   * @return the readyState of the underlying websocket.
   */
  get readyState(): number {
    return this._underlyingWebsocket.readyState;
  }

  /**
   * Getter for the bufferedAmount of the underlying websocket.
   *
   * @see https://developer.mozilla.org/en-US/docs/Web/API/WebSocket/bufferedAmount
   * @return the bufferedAmount of the underlying websocket.
   */
  get bufferedAmount(): number {
    return this._underlyingWebsocket.bufferedAmount;
  }

  /**
   * Getter for the extensions of the underlying websocket.
   *
   * @see https://developer.mozilla.org/en-US/docs/Web/API/WebSocket/extensions
   * @return the extensions of the underlying websocket.
   */
  get extensions(): string {
    return this._underlyingWebsocket.extensions;
  }

  /**
   * Getter for the binaryType of the underlying websocket.
   *
   * @see https://developer.mozilla.org/en-US/docs/Web/API/WebSocket/binaryType
   * @return the binaryType of the underlying websocket.
   */
  get binaryType(): BinaryType {
    return this._underlyingWebsocket.binaryType;
  }

  /**
   * Setter for the binaryType of the underlying websocket. The value is remembered
   * and re-applied whenever a new underlying websocket is created after a reconnect.
   *
   * @param value to set, 'blob' or 'arraybuffer'.
   */
  set binaryType(value: BinaryType) {
    this._binaryType = value;
    this._underlyingWebsocket.binaryType = value;
  }

  /**
   * Sends data over the websocket.
   *
   * If the websocket is not connected and a buffer was provided on creation, the data will be added to the buffer.
   * If no buffer was provided or the websocket was closed by the user, the data will be dropped.
   *
   * @see https://developer.mozilla.org/en-US/docs/Web/API/WebSocket/send
   * @param data to send.
   */
  public send(data: string | ArrayBufferLike | Blob | ArrayBufferView): void {
    if (this.closedByUser) return; // no-op if closed by user

    if (
      this._underlyingWebsocket.readyState === this._underlyingWebsocket.OPEN
    ) {
      this._underlyingWebsocket.send(data); // websocket is connected, send data
    } else if (this.buffer !== undefined) {
      this.buffer.add(data); // websocket is not connected, add data to buffer
    }
  }

  /**
   * Close the websocket. No automatic connection-retry will be attempted after this,
   * until reconnect() is called.
   *
   * @see https://developer.mozilla.org/en-US/docs/Web/API/WebSocket/close
   * @param code optional close code.
   * @param reason optional close reason.
   */
  public close(code?: number, reason?: string): void {
    this.cancelScheduledConnectionRetry(); // cancel any scheduled retries
    this._closedByUser = true; // mark websocket as closed by user
    this._underlyingWebsocket.close(code, reason); // close underlying websocket with provided code and reason
  }

  /**
   * (Re-)connects the websocket immediately, regardless of its current state:
   * any scheduled retry is cancelled, the backoff and its retry-counter are
   * reset, the URL provider is resolved again and a new connection is opened.
   * This also revives a websocket that was closed by the user or that gave up
   * after exceeding maxRetries (see the 'exhausted' event).
   *
   * Typical uses: a "reconnect" button after the 'exhausted' event, reacting to
   * the browser's 'online' event, or forcing the URL provider to pick up a new
   * auth token without waiting for the connection to drop.
   *
   * @throws whatever the URL provider or the WebSocket constructor throws.
   */
  public reconnect(): void {
    this.cancelScheduledConnectionRetry(); // cancel any scheduled retries
    this._closedByUser = false; // revive if the websocket was closed by the user
    this.backoff?.reset(); // start the next disconnection episode with a fresh retry budget
    this.clearWebsocket(); // detach and close the current underlying websocket
    this.tryConnect();
  }

  /**
   * Adds an event listener for the given event-type.
   *
   * @see https://developer.mozilla.org/en-US/docs/Web/API/EventTarget/addEventListener
   * @param type of the event to add the listener for.
   * @param listener to add.
   * @param options to use when adding the listener.
   */
  public addEventListener<K extends WebsocketEvent>(
    type: K,
    listener: WebsocketEventListener<K>,
    options?: WebsocketEventListenerOptions,
  ): void {
    this._options.listeners[type].push({ listener, options }); // add listener to list of listeners
  }

  /**
   * Removes all event listeners for the given event-type that match the given listener.
   *
   * Matching is done by listener identity only, mirroring the native EventTarget:
   * the options a listener was added with are ignored when matching.
   *
   * @param type of the event to remove the listener for.
   * @param listener to remove.
   * @param options ignored when matching, present for backward compatibility.
   */
  public removeEventListener<K extends WebsocketEvent>(
    type: K,
    listener: WebsocketEventListener<K>,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    options?: WebsocketEventListenerOptions,
  ): void {
    const isListenerNotToBeRemoved = (
      l: WebsocketEventListenerWithOptions<K>,
    ) => l.listener !== listener;

    (this._options.listeners[type] as WebsocketEventListenerWithOptions<K>[]) =
      this._options.listeners[type].filter(isListenerNotToBeRemoved); // only keep listeners that are not to be removed
  }

  /**
   * Creates a new browser-native websocket and connects it to the given URL with the given protocols
   * and adds all event listeners to the browser-native websocket.
   *
   * @return the created browser-native websocket which is also stored in the '_underlyingWebsocket' property.
   */
  private tryConnect(): WebSocket {
    this._url =
      typeof this._urlProvider === "function"
        ? this._urlProvider()
        : this._urlProvider;
    this._underlyingWebsocket = new WebSocket(this._url, this.protocols); // create new browser-native websocket and add all event listeners
    if (this._binaryType !== undefined) {
      this._underlyingWebsocket.binaryType = this._binaryType; // re-apply the user-chosen binaryType
    }
    this._underlyingWebsocket.addEventListener(
      WebsocketEvent.open,
      this.handleOpenEvent,
    );
    this._underlyingWebsocket.addEventListener(
      WebsocketEvent.close,
      this.handleCloseEvent,
    );
    this._underlyingWebsocket.addEventListener(
      WebsocketEvent.error,
      this.handleErrorEvent,
    );
    this._underlyingWebsocket.addEventListener(
      WebsocketEvent.message,
      this.handleMessageEvent,
    );

    return this._underlyingWebsocket;
  }

  /**
   * Removes all event listeners from the browser-native websocket and closes it.
   */
  private clearWebsocket() {
    this._underlyingWebsocket.removeEventListener(
      WebsocketEvent.open,
      this.handleOpenEvent,
    );
    this._underlyingWebsocket.removeEventListener(
      WebsocketEvent.close,
      this.handleCloseEvent,
    );
    this._underlyingWebsocket.removeEventListener(
      WebsocketEvent.error,
      this.handleErrorEvent,
    );
    this._underlyingWebsocket.removeEventListener(
      WebsocketEvent.message,
      this.handleMessageEvent,
    );
    this._underlyingWebsocket.close();
  }

  /**
   * Handles the 'open' event of the browser-native websocket.
   * @param event to handle.
   */
  private handleOpenEvent = (event: Event) =>
    this.handleEvent(WebsocketEvent.open, event);

  /**
   * Handles the 'error' event of the browser-native websocket.
   * @param event to handle.
   */
  private handleErrorEvent = (event: Event) =>
    this.handleEvent(WebsocketEvent.error, event);

  /**
   * Handles the 'close' event of the browser-native websocket.
   * @param event to handle.
   */
  private handleCloseEvent = (event: CloseEvent) =>
    this.handleEvent(WebsocketEvent.close, event);

  /**
   * Handles the 'message' event of the browser-native websocket.
   * @param event to handle.
   */
  private handleMessageEvent = (event: MessageEvent) =>
    this.handleEvent(WebsocketEvent.message, event);

  /**
   * Dispatch an event to all listeners of the given event-type.
   *
   * @param type of the event to dispatch.
   * @param event to dispatch.
   */
  private dispatchEvent<K extends WebsocketEvent>(
    type: K,
    event: WebsocketEventMap[K],
  ) {
    // iterate over a snapshot so that listeners registered during dispatch are
    // not invoked in this round, while mutations of the live list persist
    const snapshot: WebsocketEventListenerWithOptions<K>[] = [
      ...this._options.listeners[type],
    ];

    snapshot.forEach((listenerWithOptions) => {
      // re-read the live list on every invocation: a listener may have
      // added/removed listeners of this type, or replaced the list entirely
      const listeners: WebsocketEventListenerWithOptions<K>[] =
        this._options.listeners[type];

      const index = listeners.indexOf(listenerWithOptions);
      if (index === -1) {
        return; // listener was removed during dispatch, don't invoke it
      }
      if (listenerWithOptions.options?.once) {
        listeners.splice(index, 1); // remove once-listener before invoking it
      }

      listenerWithOptions.listener(this, event); // invoke listener with event
    });
  }

  /**
   * Handles the given event by dispatching it to all listeners of the given event-type.
   *
   * @param type of the event to handle.
   * @param event to handle.
   */
  private handleEvent<K extends WebsocketEvent>(
    type: K,
    event: WebsocketEventMap[K],
  ) {
    switch (type) {
      case WebsocketEvent.close:
        this.dispatchEvent(type, event);
        this.scheduleConnectionRetryIfNeeded(); // schedule a new connection retry if the websocket was closed by the server
        break;

      case WebsocketEvent.open:
        if (this.backoff !== undefined && this._lastConnection !== undefined) {
          // websocket was reconnected, dispatch reconnect event and reset backoff
          const detail: ReconnectEventDetail = {
            retries: this.backoff.retries,
            lastConnection: new Date(this._lastConnection),
          };
          const event: CustomEvent<ReconnectEventDetail> =
            new CustomEvent<ReconnectEventDetail>(WebsocketEvent.reconnect, {
              detail,
            });
          this.dispatchEvent(WebsocketEvent.reconnect, event);
          this.backoff.reset();
        }
        this._lastConnection = new Date();
        this.dispatchEvent(type, event); // dispatch open event and send buffered data
        this.sendBufferedData();
        break;

      case WebsocketEvent.retry:
        this.dispatchEvent(type, event); // dispatch retry event and try to connect
        this.clearWebsocket(); // clear the old websocket
        try {
          this.tryConnect();
        } catch {
          // the url provider or websocket-construction threw; surface it as an
          // 'error' event and keep the retry chain alive under the usual rules
          this.dispatchEvent(
            WebsocketEvent.error,
            new Event(WebsocketEvent.error),
          );
          this.scheduleConnectionRetryIfNeeded();
        }
        break;

      default:
        this.dispatchEvent(type, event); // dispatch event to all listeners of the given event-type
        break;
    }
  }

  /**
   * Sends buffered data if there is a buffer defined. Draining stops as soon as the
   * websocket is no longer open, e.g. when a listener closed it during the drain;
   * remaining elements stay buffered for the next successful connection. Without
   * this guard, send() would re-add each read element to the buffer, cycling forever.
   */
  private sendBufferedData() {
    if (this.buffer === undefined) {
      return; // no buffer defined, nothing to send
    }

    while (
      !this.closedByUser &&
      this._underlyingWebsocket.readyState === this._underlyingWebsocket.OPEN
    ) {
      const ele = this.buffer.read();
      if (ele === undefined) {
        return; // buffer is empty
      }
      this.send(ele); // send buffered data
    }
  }

  /**
   * Schedules a connection-retry if there is a backoff defined and the websocket was not closed by the user.
   */
  private scheduleConnectionRetryIfNeeded() {
    if (this.closedByUser) {
      return; // user closed the websocket, no retry
    }
    if (this.backoff === undefined) {
      return; // no backoff defined, no retry
    }

    // handler dispatches the retry event to all listeners of the retry event-type
    const handleRetryEvent = (detail: RetryEventDetail) => {
      const event: CustomEvent<RetryEventDetail> = new CustomEvent(
        WebsocketEvent.retry,
        { detail },
      );
      this.handleEvent(WebsocketEvent.retry, event);
    };

    // when the maximum number of retries is exceeded, give up and dispatch the
    // exhausted event; checked before advancing the backoff so that the counter
    // equals the number of retries actually performed
    if (
      this._options.retry.maxRetries !== undefined &&
      this.backoff.retries >= this._options.retry.maxRetries
    ) {
      const detail: ExhaustedEventDetail = {
        retries: this.backoff.retries,
        lastConnection:
          this._lastConnection && new Date(this._lastConnection),
      };
      const event: CustomEvent<ExhaustedEventDetail> =
        new CustomEvent<ExhaustedEventDetail>(WebsocketEvent.exhausted, {
          detail,
        });
      this.dispatchEvent(WebsocketEvent.exhausted, event);
      return;
    }

    // the backoff is reset on every successful reconnect, so a retry-count of
    // zero means this is the first retry of the current disconnection episode
    const isFirstRetryOfEpisode = this.backoff.retries === 0;

    // advance the backoff so the retry-count is accurate and maxRetries applies;
    // with 'instantReconnect' only the episode's first retry is instant
    const backoff = this.backoff.next();
    const retryEventDetail: RetryEventDetail = {
      backoff:
        this._options.retry.instantReconnect === true && isFirstRetryOfEpisode
          ? 0
          : backoff,
      retries: this.backoff.retries,
      lastConnection: this._lastConnection,
    };

    this.retryTimeout = globalThis.setTimeout(
      () => handleRetryEvent(retryEventDetail),
      retryEventDetail.backoff,
    );
  }

  /**
   * Cancels the scheduled connection-retry, if there is one.
   */
  private cancelScheduledConnectionRetry() {
    globalThis.clearTimeout(this.retryTimeout);
  }
}
