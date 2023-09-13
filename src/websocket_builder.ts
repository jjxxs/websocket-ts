import { Backoff } from "./backoff/backoff";
import {
  WebsocketEvent,
  WebsocketEventListener,
  WebsocketEventListenerOptions,
} from "./websocket_event";
import { Websocket } from "./websocket";
import { WebsocketBuffer } from "./websocket_buffer";
import { WebsocketOptions } from "./websocket_options";

/**
 * Builder for websockets.
 */
export class WebsocketBuilder {
  private readonly _url: string;

  private _protocols?: string | string[];
  private _options?: WebsocketOptions;

  /**
   * Creates a new WebsocketBuilder.
   *
   * @param url the url to connect to
   */
  constructor(url: string) {
    this._url = url;
  }

  /**
   * Getter for the url.
   *
   * @returns the url
   */
  get url(): string {
    return this._url;
  }

  /**
   * Adds protocols to the websocket. Subsequent calls to this method will override the previously set protocols.
   *
   * @param protocols the protocols to add
   */
  public withProtocols(
    protocols: string | string[] | undefined,
  ): WebsocketBuilder {
    this._protocols = protocols;
    return this;
  }

  /**
   * Getter for the protocols.
   *
   * @returns the protocols, undefined if no protocols have been set
   */
  get protocols(): string | string[] | undefined {
    return this._protocols;
  }

  /**
   * Sets the maximum number of retries before giving up. No limit if undefined.
   *
   * @param maxRetries the maximum number of retries before giving up
   */
  public withMaxRetries(maxRetries: number | undefined): WebsocketBuilder {
    this._options = {
      ...this._options,
      retry: { ...this._options?.retry, maxRetries },
    };
    return this;
  }

  /**
   * Getter for the maximum number of retries before giving up.
   *
   * @returns the maximum number of retries before giving up, undefined if no maximum has been set
   */
  get maxRetries(): number | undefined {
    return this._options?.retry?.maxRetries;
  }

  /**
   * Sets wether to reconnect immediately after a connection has been lost, ignoring the backoff strategy for the first retry.
   *
   * @param instantReconnect wether to reconnect immediately after a connection has been lost
   */
  public withInstantReconnect(
    instantReconnect: boolean | undefined,
  ): WebsocketBuilder {
    this._options = {
      ...this._options,
      retry: { ...this._options?.retry, instantReconnect },
    };
    return this;
  }

  /**
   * Getter for wether to reconnect immediately after a connection has been lost, ignoring the backoff strategy for the first retry.
   *
   * @returns wether to reconnect immediately after a connection has been lost, undefined if no value has been set
   */
  get instantReconnect(): boolean | undefined {
    return this._options?.retry?.instantReconnect;
  }

  /**
   * Adds a backoff to the websocket. Subsequent calls to this method will override the previously set backoff.
   *
   * @param backoff the backoff to add
   */
  public withBackoff(backoff: Backoff | undefined): WebsocketBuilder {
    this._options = {
      ...this._options,
      retry: { ...this._options?.retry, backoff },
    };
    return this;
  }

  /**
   * Getter for the backoff.
   *
   * @returns the backoff, undefined if no backoff has been set
   */
  get backoff(): Backoff | undefined {
    return this._options?.retry?.backoff;
  }

  /**
   * Adds a buffer to the websocket. Subsequent calls to this method will override the previously set buffer.
   *
   * @param buffer the buffer to add
   */
  public withBuffer(buffer: WebsocketBuffer | undefined): WebsocketBuilder {
    this._options = { ...this._options, buffer };
    return this;
  }

  /**
   * Getter for the buffer.
   *
   * @returns the buffer, undefined if no buffer has been set
   */
  get buffer(): WebsocketBuffer | undefined {
    return this._options?.buffer;
  }

  /**
   * Adds an 'open' event listener to the websocket. Subsequent calls to this method will add additional listeners that will be
   * called in the order they were added.
   *
   * @param listener the listener to add
   * @param options the listener options
   */
  public onOpen(
    listener: WebsocketEventListener<WebsocketEvent.open>,
    options?: WebsocketEventListenerOptions,
  ): WebsocketBuilder {
    this.addListener(WebsocketEvent.open, listener, options);
    return this;
  }

  /**
   * Adds an 'close' event listener to the websocket. Subsequent calls to this method will add additional listeners that will be
   * called in the order they were added.
   *
   * @param listener the listener to add
   * @param options the listener options
   */
  public onClose(
    listener: WebsocketEventListener<WebsocketEvent.close>,
    options?: WebsocketEventListenerOptions,
  ): WebsocketBuilder {
    this.addListener(WebsocketEvent.close, listener, options);
    return this;
  }

  /**
   * Adds an 'error' event listener to the websocket. Subsequent calls to this method will add additional listeners that will be
   * called in the order they were added.
   *
   * @param listener the listener to add
   * @param options the listener options
   */
  public onError(
    listener: WebsocketEventListener<WebsocketEvent.error>,
    options?: WebsocketEventListenerOptions,
  ): WebsocketBuilder {
    this.addListener(WebsocketEvent.error, listener, options);
    return this;
  }

  /**
   * Adds an 'message' event listener to the websocket. Subsequent calls to this method will add additional listeners that will be
   * called in the order they were added.
   *
   * @param listener the listener to add
   * @param options the listener options
   */
  public onMessage(
    listener: WebsocketEventListener<WebsocketEvent.message>,
    options?: WebsocketEventListenerOptions,
  ): WebsocketBuilder {
    this.addListener(WebsocketEvent.message, listener, options);
    return this;
  }

  /**
   * Adds an 'retry' event listener to the websocket. Subsequent calls to this method will add additional listeners that will be
   * called in the order they were added.
   *
   * @param listener the listener to add
   * @param options the listener options
   */
  public onRetry(
    listener: WebsocketEventListener<WebsocketEvent.retry>,
    options?: WebsocketEventListenerOptions,
  ): WebsocketBuilder {
    this.addListener(WebsocketEvent.retry, listener, options);
    return this;
  }

  /**
   * Adds an 'reconnect' event listener to the websocket. Subsequent calls to this method will add additional listeners that will be
   * called in the order they were added.
   *
   * @param listener the listener to add
   * @param options the listener options
   */
  public onReconnect(
    listener: WebsocketEventListener<WebsocketEvent.reconnect>,
    options?: WebsocketEventListenerOptions,
  ): WebsocketBuilder {
    this.addListener(WebsocketEvent.reconnect, listener, options);
    return this;
  }

  /**
   * Builds the websocket.
   *
   * @return a new websocket, with the set options
   */
  public build(): Websocket {
    return new Websocket(this._url, this._protocols, this._options); // instantiate the websocket with the set options
  }

  /**
   * Adds an event listener to the options.
   *
   * @param event the event to add the listener to
   * @param listener the listener to add
   * @param options the listener options
   */
  private addListener<K extends WebsocketEvent>(
    event: WebsocketEvent,
    listener: WebsocketEventListener<K>,
    options?: WebsocketEventListenerOptions,
  ): WebsocketBuilder {
    this._options = {
      ...this._options,
      listeners: {
        open: this._options?.listeners?.open ?? [],
        close: this._options?.listeners?.close ?? [],
        error: this._options?.listeners?.error ?? [],
        message: this._options?.listeners?.message ?? [],
        retry: this._options?.listeners?.retry ?? [],
        reconnect: this._options?.listeners?.reconnect ?? [],
        [event]: [
          ...(this._options?.listeners?.[event] ?? []),
          { listener, options },
        ],
      },
    };
    return this;
  }
}
