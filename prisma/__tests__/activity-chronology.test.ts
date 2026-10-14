import { describe, expect, it } from "vitest";

import { threads } from "../seeds/messaging/fixtures";
import { northwindAt, northwindDataset } from "../seeds/northwind-data";
import { SYNTHETIC_SEED_TIMELINE, SYNTHETIC_TIMELINE_SHIFT_MS } from "../seeds/timeline";

const DAY = 24 * 60 * 60 * 1_000;
const MINUTES_PER_DAY = 24 * 60;

describe("synthetic activity chronology", () => {
  it("spreads history-backed fixture timestamps across eighteen months", () => {
    const data = northwindDataset();
    const dates = [
      SYNTHETIC_SEED_TIMELINE.company.createdAt,
      SYNTHETIC_SEED_TIMELINE.systemRole.createdAt,
      ...[...data.organizations, ...data.contacts, ...data.deals, ...data.tasks].map(({ createdAtMs }) =>
        northwindAt(createdAtMs),
      ),
      ...data.tickets.map(({ openedMs }) => northwindAt(openedMs)),
      SYNTHETIC_SEED_TIMELINE.webhook.updatedAt,
    ];
    const earliest = Math.min(...dates.map((date) => date.getTime()));
    const latest = Math.max(...dates.map((date) => date.getTime()));
    const authored = (moment: number) => new Date(moment - SYNTHETIC_TIMELINE_SHIFT_MS).toISOString();

    expect(authored(earliest)).toBe("2025-01-02T08:00:00.000Z");
    expect(authored(latest)).toBe("2026-08-04T14:00:00.000Z");
    expect((latest - earliest) / DAY).toBeGreaterThanOrEqual(540);
  });

  it("keeps the newest fixture inside the current week so rolling date buckets stay populated", () => {
    const newest = SYNTHETIC_SEED_TIMELINE.webhook.updatedAt.getTime();

    expect(newest).toBeLessThanOrEqual(Date.now());
    expect(Date.now() - newest).toBeLessThan(7 * DAY);
  });

  it("keeps messages ordered from minutes ago through roughly eleven months ago", () => {
    const offsets = threads.map(({ latestMinutesAgo }) => latestMinutesAgo);

    expect(offsets[0]).toBeLessThan(10);
    expect(offsets.at(-1)).toBeGreaterThanOrEqual(330 * MINUTES_PER_DAY);
    expect(offsets).toEqual(offsets.toSorted((left, right) => left - right));
    expect(new Set(offsets).size).toBe(offsets.length);
  });
});
