import type { TranscriptEvent } from "./types.js";

export const EVENT_MAX_BYTES = 4096;

const STRING_LIMITS = [2000, 1000, 500, 250, 120, 60];

function byteLength(value: unknown): number {
  return Buffer.byteLength(JSON.stringify(value), "utf8");
}

function shorten(value: unknown, limit: number): unknown {
  if (typeof value === "string") return value.length > limit ? `${value.slice(0, limit)}...` : value;
  if (Array.isArray(value)) return value.map((entry) => shorten(entry, limit));
  if (value !== null && typeof value === "object")
    return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, shorten(entry, limit)]));
  return value;
}

export function trimEvent(event: TranscriptEvent): TranscriptEvent {
  if (byteLength(event) <= EVENT_MAX_BYTES) return event;
  for (const limit of STRING_LIMITS) {
    const shortened = { ...(shorten(event, limit) as TranscriptEvent), truncated: true };
    if (byteLength(shortened) <= EVENT_MAX_BYTES) return shortened;
  }
  return { type: typeof event.type === "string" ? event.type.slice(0, 60) : "event", truncated: true };
}
