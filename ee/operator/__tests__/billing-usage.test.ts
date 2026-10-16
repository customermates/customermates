import { describe, expect, it } from "vitest";

import {
  billedSeats,
  billingUsageMonthsBetween,
  billingUsageWindow,
  lastFullBillingUsageMonth,
  peakChannels,
  workspaceBillingUsage,
  type BillingUsageIntervalRow,
  type BillingUsageWorkspaceRow,
} from "../billing-usage";
import { billingUsageSummaryCsv } from "../billing-usage-csv";

const SEPTEMBER = billingUsageWindow("2026-09");

function at(iso: string): Date {
  return new Date(iso);
}

function seat(
  subjectId: string,
  startedAt: string,
  endedAt: string | null = null,
  extra: Partial<BillingUsageIntervalRow> = {},
) {
  return {
    kind: "seat",
    subjectId,
    startedAt: at(startedAt),
    endedAt: endedAt ? at(endedAt) : null,
    startExact: true,
    endExact: true,
    firstName: subjectId,
    lastName: "Tester",
    email: `${subjectId}@example.invalid`,
    roleName: "Member",
    provider: null,
    identifier: null,
    ...extra,
  } satisfies BillingUsageIntervalRow;
}

function channel(
  subjectId: string,
  startedAt: string,
  endedAt: string | null = null,
  extra: Partial<BillingUsageIntervalRow> = {},
) {
  return {
    kind: "channel",
    subjectId,
    startedAt: at(startedAt),
    endedAt: endedAt ? at(endedAt) : null,
    startExact: true,
    endExact: true,
    firstName: null,
    lastName: null,
    email: null,
    roleName: null,
    provider: "google",
    identifier: `${subjectId}@example.invalid`,
    ...extra,
  } satisfies BillingUsageIntervalRow;
}

function workspace(extra: Partial<BillingUsageWorkspaceRow> = {}): BillingUsageWorkspaceRow {
  return {
    companyId: "00000000-0000-4000-8000-000000000010",
    workspaceLabel: "example.invalid",
    createdAt: at("2026-01-01T00:00:00.000Z"),
    deletedAt: null,
    seatsRecordedFrom: null,
    channelsRecordedFrom: null,
    activeSeats: 3,
    connectedChannels: 2,
    ...extra,
  };
}

describe("billing usage months", () => {
  it("spans calendar months in UTC and defaults to the last full month", () => {
    expect(SEPTEMBER.from.toISOString()).toBe("2026-09-01T00:00:00.000Z");
    expect(SEPTEMBER.to.toISOString()).toBe("2026-10-01T00:00:00.000Z");
    expect(billingUsageWindow("2026-12").to.toISOString()).toBe("2027-01-01T00:00:00.000Z");
    expect(lastFullBillingUsageMonth(at("2026-10-16T08:00:00.000Z"))).toBe("2026-09");
    expect(lastFullBillingUsageMonth(at("2027-01-01T00:00:00.000Z"))).toBe("2026-12");
    expect(billingUsageMonthsBetween(at("2026-08-20T00:00:00.000Z"), at("2026-10-02T00:00:00.000Z"))).toEqual([
      "2026-10",
      "2026-09",
      "2026-08",
    ]);
  });

  it("rejects malformed months", () => {
    expect(() => billingUsageWindow("2026-13")).toThrow();
    expect(() => billingUsageWindow("2026-9")).toThrow();
  });
});

describe("billed seats", () => {
  it("counts a user deactivated mid-month for the full month", () => {
    const seats = billedSeats([seat("ada", "2026-03-01T00:00:00.000Z", "2026-09-14T10:00:00.000Z")], SEPTEMBER);

    expect(seats).toHaveLength(1);
    expect(seats[0]).toMatchObject({ userId: "ada", deactivatedAt: at("2026-09-14T10:00:00.000Z") });
  });

  it("counts a user added on the last day of the month", () => {
    const seats = billedSeats([seat("bo", "2026-09-30T23:59:59.000Z")], SEPTEMBER);

    expect(seats.map((entry) => entry.userId)).toEqual(["bo"]);
  });

  it("ignores users deactivated before the month and users added after it", () => {
    const seats = billedSeats(
      [
        seat("gone", "2026-01-01T00:00:00.000Z", "2026-08-31T23:59:59.000Z"),
        seat("boundary", "2026-01-01T00:00:00.000Z", "2026-09-01T00:00:00.000Z"),
        seat("later", "2026-10-01T00:00:00.000Z"),
      ],
      SEPTEMBER,
    );

    expect(seats).toEqual([]);
  });

  it("counts a user once however often they were deactivated and reactivated, keeping the first addition", () => {
    const seats = billedSeats(
      [
        seat("cy", "2026-02-01T00:00:00.000Z", "2026-09-05T00:00:00.000Z"),
        seat("cy", "2026-09-10T00:00:00.000Z", "2026-09-12T00:00:00.000Z", { roleName: "Admin" }),
        seat("cy", "2026-09-20T00:00:00.000Z", null, { roleName: "Owner" }),
      ],
      SEPTEMBER,
    );

    expect(seats).toHaveLength(1);
    expect(seats[0]).toMatchObject({
      addedAt: at("2026-02-01T00:00:00.000Z"),
      deactivatedAt: null,
      roleName: "Owner",
    });
  });

  it("carries inferred start times as inexact", () => {
    const seats = billedSeats([seat("di", "2026-05-01T00:00:00.000Z", null, { startExact: false })], SEPTEMBER);

    expect(seats[0]).toMatchObject({ addedAtExact: false, deactivatedAtExact: true });
  });
});

describe("peak channels", () => {
  it("takes the highest number connected at the same time, not the total connected in the month", () => {
    const result = peakChannels(
      [
        channel("a", "2026-09-02T00:00:00.000Z", "2026-09-05T00:00:00.000Z"),
        channel("b", "2026-09-06T00:00:00.000Z", "2026-09-09T00:00:00.000Z"),
        channel("c", "2026-09-10T00:00:00.000Z", "2026-09-12T00:00:00.000Z"),
      ],
      SEPTEMBER,
    );

    expect(result).toEqual({ peak: 1, peakAt: at("2026-09-02T00:00:00.000Z") });
  });

  it("counts overlapping intervals and reports when the peak was first reached", () => {
    const result = peakChannels(
      [
        channel("carried", "2026-08-01T00:00:00.000Z"),
        channel("short", "2026-09-03T00:00:00.000Z", "2026-09-04T00:00:00.000Z"),
        channel("long", "2026-09-03T12:00:00.000Z", "2026-09-20T00:00:00.000Z"),
        channel("late", "2026-09-25T00:00:00.000Z"),
      ],
      SEPTEMBER,
    );

    expect(result).toEqual({ peak: 3, peakAt: at("2026-09-03T12:00:00.000Z") });
  });

  it("does not overlap a channel that disconnects at the instant another connects", () => {
    const result = peakChannels(
      [
        channel("first", "2026-09-01T00:00:00.000Z", "2026-09-10T00:00:00.000Z"),
        channel("second", "2026-09-10T00:00:00.000Z"),
      ],
      SEPTEMBER,
    );

    expect(result.peak).toBe(1);
  });

  it("reports no peak time when nothing was connected", () => {
    expect(peakChannels([channel("old", "2026-01-01T00:00:00.000Z", "2026-02-01T00:00:00.000Z")], SEPTEMBER)).toEqual({
      peak: 0,
      peakAt: null,
    });
  });
});

describe("workspace billing usage", () => {
  it("keeps a deleted workspace's history for the months it existed and reports nothing as current", () => {
    const usage = workspaceBillingUsage({
      workspace: workspace({ deletedAt: at("2026-09-18T00:00:00.000Z") }),
      intervals: [
        seat("ada", "2026-02-01T00:00:00.000Z", "2026-09-18T00:00:00.000Z"),
        channel("a", "2026-02-01T00:00:00.000Z", "2026-09-17T00:00:00.000Z"),
      ],
      window: SEPTEMBER,
      includeDetails: false,
    });

    expect(usage).toMatchObject({
      deletedAt: at("2026-09-18T00:00:00.000Z"),
      seats: { count: 1 },
      channels: { peak: 1 },
      current: { activeSeats: 0, connectedChannels: 0 },
    });
    expect(usage.seats.users).toBeUndefined();
  });

  it("marks months before recording started as incomplete and inexact channel times as approximate", () => {
    const usage = workspaceBillingUsage({
      workspace: workspace({
        seatsRecordedFrom: at("2026-10-16T09:00:00.000Z"),
        channelsRecordedFrom: at("2026-07-03T00:00:00.000Z"),
      }),
      intervals: [channel("a", "2026-08-01T00:00:00.000Z", "2026-09-20T00:00:00.000Z", { endExact: false })],
      window: SEPTEMBER,
      includeDetails: true,
    });

    expect(usage.seats.coverage).toEqual({
      complete: false,
      recordedFrom: at("2026-10-16T09:00:00.000Z"),
      inexactTimes: false,
    });
    expect(usage.channels.coverage).toMatchObject({ complete: false, inexactTimes: true });
    expect(usage.channels.items?.[0]).toMatchObject({ disconnectedAtExact: false });
  });

  it("is complete for a month after recording started", () => {
    const usage = workspaceBillingUsage({
      workspace: workspace({ seatsRecordedFrom: at("2026-10-16T09:00:00.000Z") }),
      intervals: [seat("ada", "2026-05-01T00:00:00.000Z", null, { startExact: false })],
      window: billingUsageWindow("2026-11"),
      includeDetails: true,
    });

    expect(usage.seats).toMatchObject({ count: 1, coverage: { complete: true } });
  });

  it("exports the summary as CSV with ISO timestamps and neutralized formulas", () => {
    const csv = billingUsageSummaryCsv({
      month: "2026-09",
      from: SEPTEMBER.from,
      to: SEPTEMBER.to,
      monthComplete: true,
      workspaces: [
        workspaceBillingUsage({
          workspace: workspace({ workspaceLabel: "=cmd" }),
          intervals: [seat("ada", "2026-05-01T00:00:00.000Z"), channel("a", "2026-09-03T00:00:00.000Z")],
          window: SEPTEMBER,
          includeDetails: false,
        }),
      ],
    });

    expect(csv.split("\n")).toEqual([
      "month,workspace_id,workspace,workspace_deleted_at,seats,seats_complete,peak_channels,peak_channels_at,channels_complete,active_seats_now,connected_channels_now",
      "2026-09,00000000-0000-4000-8000-000000000010,'=cmd,,1,true,1,2026-09-03T00:00:00.000Z,true,3,2",
      "",
    ]);
  });
});
