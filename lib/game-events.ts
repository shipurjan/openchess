import { EventEmitter } from "events";

const globalForEvents = globalThis as unknown as {
  gameEvents: EventEmitter | undefined;
};

export const gameEvents =
  globalForEvents.gameEvents ?? new EventEmitter();

globalForEvents.gameEvents = gameEvents;
