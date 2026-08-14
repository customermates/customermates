import { describe, expect, it } from "vitest";

import { SYNTHETIC_CONTACT_NAMES } from "../seeds/contacts";
import { SYNTHETIC_CUSTOM_COLUMN_DEFINITIONS } from "../seeds/custom-fields";
import { SYNTHETIC_DEAL_NAMES } from "../seeds/deals";
import { threads } from "../seeds/messaging/fixtures";
import { SYNTHETIC_ORGANIZATION_DEFINITIONS } from "../seeds/organizations";
import { SYNTHETIC_SERVICE_NAMES } from "../seeds/services";
import { SYNTHETIC_TASK_NAMES } from "../seeds/tasks";
import { SYNTHETIC_SEED_TIMELINE } from "../seeds/timeline";

const DAY = 24 * 60 * 60 * 1_000;
const MINUTES_PER_DAY = 24 * 60;

function timelineDates(count: number, timeline: (index: number) => { createdAt: Date; updatedAt: Date }): Date[] {
  return Array.from({ length: count }, (_, index) => {
    const { createdAt, updatedAt } = timeline(index);
    expect(updatedAt.getTime()).toBeGreaterThanOrEqual(createdAt.getTime());
    return [createdAt, updatedAt];
  }).flat();
}

describe("synthetic activity chronology", () => {
  it("spreads audit-backed fixture timestamps across nearly a full year", () => {
    const dates = [
      SYNTHETIC_SEED_TIMELINE.company.createdAt,
      SYNTHETIC_SEED_TIMELINE.systemRole.createdAt,
      ...timelineDates(SYNTHETIC_CUSTOM_COLUMN_DEFINITIONS.length, SYNTHETIC_SEED_TIMELINE.customColumn),
      ...timelineDates(SYNTHETIC_ORGANIZATION_DEFINITIONS.length, SYNTHETIC_SEED_TIMELINE.organization),
      ...timelineDates(SYNTHETIC_CONTACT_NAMES.length, SYNTHETIC_SEED_TIMELINE.contact),
      ...timelineDates(SYNTHETIC_SERVICE_NAMES.length, SYNTHETIC_SEED_TIMELINE.service),
      ...timelineDates(SYNTHETIC_DEAL_NAMES.length, SYNTHETIC_SEED_TIMELINE.deal),
      ...timelineDates(SYNTHETIC_TASK_NAMES.length, SYNTHETIC_SEED_TIMELINE.task),
      ...timelineDates(3, SYNTHETIC_SEED_TIMELINE.connectedAccount),
      SYNTHETIC_SEED_TIMELINE.webhook.createdAt,
      SYNTHETIC_SEED_TIMELINE.webhook.updatedAt,
    ];
    const earliest = Math.min(...dates.map((date) => date.getTime()));
    const latest = Math.max(...dates.map((date) => date.getTime()));

    expect(new Date(earliest).toISOString()).toBe("2025-08-06T08:00:00.000Z");
    expect(new Date(latest).toISOString()).toBe("2026-08-04T14:00:00.000Z");
    expect((latest - earliest) / DAY).toBeGreaterThanOrEqual(360);
    expect(latest).toBeLessThan(Date.parse("2026-08-06T00:00:00.000Z"));
  });

  it("keeps messages ordered from minutes ago through roughly eleven months ago", () => {
    const offsets = threads.map(({ latestMinutesAgo }) => latestMinutesAgo);

    expect(offsets[0]).toBeLessThan(10);
    expect(offsets.at(-1)).toBeGreaterThanOrEqual(330 * MINUTES_PER_DAY);
    expect(offsets).toEqual(offsets.toSorted((left, right) => left - right));
    expect(new Set(offsets).size).toBe(offsets.length);
  });
});
