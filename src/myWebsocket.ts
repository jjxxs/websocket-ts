import { WebsocketBuilder } from "./websocket_builder";
import { WebsocketEvent } from "./websocket_event";
import { ExponentialBackoff } from "./backoff/exponentialbackoff";
import { RingQueue } from "./queue/ring_queue";

const ws = new WebsocketBuilder("ws://localhost:42421")
  .withBackoff(new ExponentialBackoff(1000, 3)) // 1s, 2s, 4s, 8s
  .withBuffer(new RingQueue<string>(10)) // 10 elements
  .build();

ws.addEventListener(WebsocketEvent.open, (instance, ev) => {
  ev.stopPropagation();
  console.log("Connected with server");
  instance.send("Hello server");
});
