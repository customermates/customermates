import { describe, expect, it } from "vitest";

import { SEED_IDS } from "../seeds/context";
import { NORTHWIND_HISTORY_DAYS, NORTHWIND_STORY_END_MS, northwindDataset } from "../seeds/northwind-data";
import { buildNorthwindHistory, type NorthwindHistoryEntry } from "../seeds/northwind-history";
import { NORTHWIND_MEMBER_IDS } from "../seeds/northwind-model";
import { SYNTHETIC_RECORD_EVENT_ID_PREFIX } from "../seeds/record-history";

const DAY = 86_400_000;
const entries = buildNorthwindHistory(SEED_IDS.company);
const data = northwindDataset();

function entryFor(kind: NorthwindHistoryEntry["kind"], recordId: string) {
  const entry = entries.find((candidate) => candidate.kind === kind && candidate.recordId === recordId);
  if (!entry) throw new Error(`Missing ${kind} history for ${recordId}`);
  return entry;
}

describe("synthetic record history", () => {
  it("creates every record once and records its changes afterwards", () => {
    const records =
      data.organizations.length +
      data.contacts.length +
      data.services.length +
      data.deals.length +
      data.tasks.length +
      data.subscriptions.length +
      data.onboardings.length +
      data.tickets.length +
      data.campaigns.length +
      data.partners.length +
      data.openRoles.length +
      data.candidates.length;

    expect(entries.filter(({ kind }) => kind === "record.created")).toHaveLength(records);
    expect(new Set(entries.map(({ id }) => id))).toHaveLength(entries.length);
    expect(entries.every(({ id }) => id.startsWith(`${SYNTHETIC_RECORD_EVENT_ID_PREFIX}-`))).toBe(true);
    expect(buildNorthwindHistory(SEED_IDS.company)).toEqual(entries);
    const updates = entries.filter(({ kind }) => kind === "record.updated");
    expect(updates.length).toBeGreaterThan(300);
    for (const update of updates) {
      expect(update.atMs).toBeGreaterThanOrEqual(entryFor("record.created", update.recordId).atMs);
      expect(update.previous.length).toBeGreaterThan(0);
    }
    for (const deal of data.deals.filter(({ status }) => status !== "open"))
      expect(entries.some((entry) => entry.kind === "record.updated" && entry.recordId === deal.id)).toBe(true);
  });

  it("spreads the history over eighteen months up to the story end", () => {
    const timestamps = entries.map(({ atMs }) => atMs);
    const months = new Set(entries.map(({ atMs }) => new Date(atMs).toISOString().slice(0, 7)));

    expect(Math.min(...timestamps)).toBeGreaterThanOrEqual(
      NORTHWIND_STORY_END_MS - (NORTHWIND_HISTORY_DAYS + 120) * DAY,
    );
    expect(Math.max(...timestamps)).toBeLessThan(NORTHWIND_STORY_END_MS);
    expect(months.size).toBeGreaterThanOrEqual(18);
    expect(entries.map(({ atMs }) => atMs)).toEqual(timestamps.toSorted((a, b) => a - b));
  });

  it("attributes every change to the member who owns the work", () => {
    const members = new Set<string>(Object.values(NORTHWIND_MEMBER_IDS));
    expect(entries.every(({ actorId }) => members.has(actorId))).toBe(true);
    expect(new Set(entries.map(({ actorId }) => actorId))).toEqual(members);
    for (const deal of data.deals)
      expect(entryFor("record.created", deal.id).actorId).toBe(NORTHWIND_MEMBER_IDS[deal.ownerKey]);
    for (const ticket of data.tickets)
      expect(entryFor("record.created", ticket.id).actorId).toBe(NORTHWIND_MEMBER_IDS[ticket.assigneeKey]);
  });
});
