const DRAINS = Symbol.for("customermates.eventDrains");

export type EventDrain = { rescan: boolean };

type DrainStore = typeof globalThis & { [DRAINS]?: Map<string, EventDrain> };

function activeDrains(): Map<string, EventDrain> {
  const store = globalThis as DrainStore;
  store[DRAINS] ??= new Map();
  return store[DRAINS];
}

export function beginEventDrain(companyId: string): EventDrain | null {
  const drains = activeDrains();
  if (drains.has(companyId)) return null;
  const drain = { rescan: false };
  drains.set(companyId, drain);
  return drain;
}

export function endEventDrain(companyId: string, drain: EventDrain): void {
  const drains = activeDrains();
  if (drains.get(companyId) === drain) drains.delete(companyId);
}

export function requestEventDrainRescan(companyId: string): boolean {
  const drain = activeDrains().get(companyId);
  if (!drain) return false;
  drain.rescan = true;
  return true;
}
