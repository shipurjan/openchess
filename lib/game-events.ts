import { EventEmitter } from "events";

const globalForEvents = globalThis as unknown as {
  gameEvents: EventEmitter | undefined;
};

export const gameEvents =
  globalForEvents.gameEvents ?? new EventEmitter();

if (process.env.NODE_ENV !== "production")
  globalForEvents.gameEvents = gameEvents;
