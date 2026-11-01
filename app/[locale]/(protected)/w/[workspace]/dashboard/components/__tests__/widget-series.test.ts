import type { RecordMeasure } from "@/features/records/record-measure.schema";

import { describe, expect, it } from "vitest";

import {
  bucketQuarter,
  bucketStartOf,
  closedLostOptionIds,
  isIntegerSeries,
  isoWeek,
  fillTimeSeries,
  funnelConversions,
  measureTimeWindow,
  orderByOptionPosition,
  orderFunnelSteps,
  rankByValue,
  shareOfTotal,
  shiftBucketStart,
} from "../widget-series";

describe("widget series helpers", () => {
  it("advances bucket starts by calendar interval across month and year ends", () => {
    expect(shiftBucketStart("2026-12-31", "day")).toBe("2027-01-01");
    expect(shiftBucketStart("2026-12-28", "week")).toBe("2027-01-04");
    expect(shiftBucketStart("2026-01-01", "month")).toBe("2026-02-01");
    expect(shiftBucketStart("2026-10-01", "quarter")).toBe("2027-01-01");
    expect(shiftBucketStart("2026-01-01", "year", 2)).toBe("2028-01-01");
    expect(bucketQuarter("2026-07-01")).toBe(3);
  });

  it("fills empty buckets between the first and last period in chronological order", () => {
    expect(
      fillTimeSeries(
        [
          { start: "2026-04-01", item: "april" },
          { start: "2026-01-01", item: "january" },
        ],
        "month",
      ),
    ).toEqual([
      { start: "2026-01-01", item: "january" },
      { start: "2026-02-01", item: null },
      { start: "2026-03-01", item: null },
      { start: "2026-04-01", item: "april" },
    ]);
    expect(fillTimeSeries([], "day")).toEqual([]);
    expect(
      fillTimeSeries(
        [
          { start: "2026-01-01", item: 1 },
          { start: "2026-01-10", item: 2 },
        ],
        "day",
        5,
      ),
    ).toEqual([
      { start: "2026-01-01", item: 1 },
      { start: "2026-01-10", item: 2 },
    ]);
  });

  it("snaps dates to calendar bucket starts with ISO weeks", () => {
    expect(bucketStartOf("2026-10-31", "day")).toBe("2026-10-31");
    expect(bucketStartOf("2026-10-31", "week")).toBe("2026-10-26");
    expect(bucketStartOf("2026-10-26", "week")).toBe("2026-10-26");
    expect(bucketStartOf("2027-01-03", "week")).toBe("2026-12-28");
    expect(bucketStartOf("2026-10-31", "month")).toBe("2026-10-01");
    expect(bucketStartOf("2026-11-15", "quarter")).toBe("2026-10-01");
    expect(bucketStartOf("2026-11-15", "year")).toBe("2026-01-01");
  });

  it("covers the whole window around the periods with records", () => {
    expect(
      fillTimeSeries([{ start: "2026-10-29", item: 4 }], "day", undefined, { first: "2026-10-27", last: "2026-10-31" }),
    ).toEqual([
      { start: "2026-10-27", item: null },
      { start: "2026-10-28", item: null },
      { start: "2026-10-29", item: 4 },
      { start: "2026-10-30", item: null },
      { start: "2026-10-31", item: null },
    ]);
    expect(
      fillTimeSeries([{ start: "2026-10-12", item: 1 }], "week", undefined, {
        first: "2026-10-05",
        last: "2026-10-26",
      }),
    ).toEqual([
      { start: "2026-10-05", item: null },
      { start: "2026-10-12", item: 1 },
      { start: "2026-10-19", item: null },
      { start: "2026-10-26", item: null },
    ]);
    expect(
      fillTimeSeries([{ start: "2026-09-01", item: 2 }], "month", undefined, {
        first: "2026-08-01",
        last: "2026-10-01",
      }),
    ).toEqual([
      { start: "2026-08-01", item: null },
      { start: "2026-09-01", item: 2 },
      { start: "2026-10-01", item: null },
    ]);
    expect(
      fillTimeSeries([{ start: "2026-07-01", item: 9 }], "day", undefined, { first: "2026-10-01", last: "2026-10-02" }),
    ).toEqual([
      { start: "2026-07-01", item: 9 },
      ...Array.from({ length: 93 }, (_, index) => ({
        start: new Date(Date.UTC(2026, 6, 2 + index)).toISOString().slice(0, 10),
        item: null,
      })),
    ]);
    expect(fillTimeSeries([], "day", undefined, { first: "2026-10-01", last: "2026-10-02" })).toEqual([]);
    expect(
      fillTimeSeries([{ start: "2026-10-31", item: 1 }], "day", 5, { first: "2026-01-01", last: "2026-10-31" }),
    ).toEqual([{ start: "2026-10-31", item: 1 }]);
  });

  it("derives the bucket window from time filters on the grouped field", () => {
    const FIELD = "9c9f1c8e-6a7c-4a4b-9a77-9d1d3d2f7d03";
    const OTHER = "9c9f1c8e-6a7c-4a4b-9a77-9d1d3d2f7d04";
    const build = (
      filters: RecordMeasure["source"]["filters"],
      groupBy: Partial<NonNullable<RecordMeasure["groupBy"]>> = {},
    ) =>
      ({
        source: { typeId: OTHER, filters, relationships: [] },
        aggregation: "count",
        valueFieldId: null,
        groupBy: { path: [], fieldId: FIELD, dateInterval: "day", ...groupBy },
        groupLimit: 1000,
      }) as unknown as RecordMeasure;
    const lastDays = (days: number, fieldId = FIELD) => ({
      fieldId,
      operator: "inLastDays" as const,
      value: { kind: "decimal" as const, value: String(days), currency: null },
    });
    const now = new Date("2026-10-31T10:00:00.000Z");

    expect(measureTimeWindow(build([lastDays(30)]), now)).toEqual({ first: "2026-10-01", last: "2026-10-31" });
    expect(measureTimeWindow(build([lastDays(30)], { dateInterval: "week" }), now)).toEqual({
      first: "2026-09-28",
      last: "2026-10-26",
    });
    expect(measureTimeWindow(build([lastDays(90)], { dateInterval: "month" }), now)).toEqual({
      first: "2026-08-01",
      last: "2026-10-01",
    });
    expect(measureTimeWindow(build([lastDays(30, OTHER)]), now)).toBeNull();
    expect(measureTimeWindow(build([]), now)).toBeNull();
    expect(measureTimeWindow(build([lastDays(30)], { dateInterval: undefined }), now)).toBeNull();
    expect(
      measureTimeWindow(build([lastDays(30)], { path: [{ relationId: OTHER, direction: "outgoing" }] }), now),
    ).toBeNull();
    expect(
      measureTimeWindow(
        build([], {
          path: [{ relationId: OTHER, direction: "outgoing" }],
          filter: { filters: [lastDays(7)] } as NonNullable<RecordMeasure["groupBy"]>["filter"],
        }),
        now,
      ),
    ).toEqual({ first: "2026-10-24", last: "2026-10-31" });

    expect(
      measureTimeWindow(
        build([
          {
            fieldId: FIELD,
            operator: "between",
            value: null,
            values: [
              { kind: "date", value: "2026-09-01" },
              { kind: "date", value: "2026-09-30" },
            ],
          },
        ]),
        now,
      ),
    ).toEqual({ first: "2026-09-01", last: "2026-09-30" });
    expect(
      measureTimeWindow(
        build([
          { fieldId: FIELD, operator: "gte", value: { kind: "date", value: "2026-10-20" } },
          { fieldId: FIELD, operator: "lte", value: { kind: "date", value: "2026-10-25" } },
          lastDays(30),
        ]),
        now,
      ),
    ).toEqual({ first: "2026-10-20", last: "2026-10-25" });
    expect(
      measureTimeWindow(
        build([{ fieldId: FIELD, operator: "lte", value: { kind: "date", value: "2026-10-25" } }]),
        now,
      ),
    ).toBeNull();
    expect(
      measureTimeWindow(
        build([
          { fieldId: FIELD, operator: "gte", value: { kind: "date", value: "2026-10-20" } },
          { fieldId: FIELD, operator: "lt", value: { kind: "date", value: "2026-10-10" } },
        ]),
        now,
      ),
    ).toBeNull();
    expect(
      measureTimeWindow(
        build([{ fieldId: "system:createdAt", operator: "gte", value: { kind: "date", value: "2026-10-29" } }], {
          fieldId: "system:createdAt",
        }),
        now,
      ),
    ).toEqual({ first: "2026-10-29", last: "2026-10-31" });
  });

  it("places today and dateTime endpoints in the grouping time zone across the Berlin DST change", () => {
    const FIELD = "9c9f1c8e-6a7c-4a4b-9a77-9d1d3d2f7d03";
    const build = (filters: RecordMeasure["source"]["filters"], timeZone?: string) =>
      ({
        source: { typeId: FIELD, filters, relationships: [] },
        aggregation: "count",
        valueFieldId: null,
        groupBy: { path: [], fieldId: FIELD, dateInterval: "day", ...(timeZone ? { timeZone } : {}) },
        groupLimit: 1000,
      }) as unknown as RecordMeasure;
    const lastDays = [
      {
        fieldId: FIELD,
        operator: "inLastDays" as const,
        value: { kind: "decimal" as const, value: "3", currency: null },
      },
    ];

    const lateEvening = new Date("2026-10-31T23:30:00.000Z");
    expect(measureTimeWindow(build(lastDays), lateEvening)).toEqual({ first: "2026-10-28", last: "2026-10-31" });
    expect(measureTimeWindow(build(lastDays, "Europe/Berlin"), lateEvening)).toEqual({
      first: "2026-10-28",
      last: "2026-11-01",
    });
    expect(measureTimeWindow(build(lastDays, "Europe/Berlin"), new Date("2026-10-24T22:30:00.000Z"))).toEqual({
      first: "2026-10-21",
      last: "2026-10-25",
    });
    expect(measureTimeWindow(build(lastDays, "Europe/Berlin"), new Date("2026-10-25T22:30:00.000Z"))).toEqual({
      first: "2026-10-22",
      last: "2026-10-25",
    });
    expect(
      measureTimeWindow(
        build(
          [
            {
              fieldId: FIELD,
              operator: "between",
              value: null,
              values: [
                { kind: "dateTime", value: "2026-10-24T22:30:00.000Z" },
                { kind: "dateTime", value: "2026-10-26T23:30:00.000Z" },
              ],
            },
          ],
          "Europe/Berlin",
        ),
        lateEvening,
      ),
    ).toEqual({ first: "2026-10-25", last: "2026-10-27" });
    expect(
      measureTimeWindow(
        build(
          [{ fieldId: FIELD, operator: "gte", value: { kind: "dateTime", value: "2026-10-24T20:00:00.000Z" } }],
          "America/New_York",
        ),
        lateEvening,
      ),
    ).toEqual({ first: "2026-10-24", last: "2026-10-31" });
    const window = measureTimeWindow(build(lastDays, "Europe/Berlin"), new Date("2026-10-26T12:00:00.000Z"));
    expect(window).toEqual({ first: "2026-10-23", last: "2026-10-26" });
    expect(
      fillTimeSeries([{ start: "2026-10-25", item: 1 }], "day", undefined, window).map(({ start }) => start),
    ).toEqual(["2026-10-23", "2026-10-24", "2026-10-25", "2026-10-26"]);
  });

  it("orders funnel steps by option order and fills skipped steps only between present ones", () => {
    const steps = [
      { optionId: "proposal", item: 2 },
      { optionId: "new", item: 9 },
      { optionId: "removed", item: 1 },
    ];
    const order = ["new", "qualified", "proposal", "won", "lost"];
    expect(orderFunnelSteps(steps, order, true)).toEqual([
      { optionId: "new", item: 9 },
      { optionId: "qualified", item: null },
      { optionId: "proposal", item: 2 },
      { optionId: "removed", item: 1 },
    ]);
    expect(orderFunnelSteps(steps, order, false).map((step) => step.optionId)).toEqual(["new", "proposal", "removed"]);
    expect(funnelConversions([10, 5, 0, 3])).toEqual([null, 0.5, 0, null]);
    expect(funnelConversions([1, 1, 3])).toEqual([null, 1, null]);
  });

  it("ranks by value with unavailable values last and computes shares of a positive total", () => {
    const rows = [
      { label: "Beta", value: 5 },
      { label: "Restricted", value: null },
      { label: "Alpha", value: 5 },
      { label: "Gamma", value: 20 },
    ];
    expect(rankByValue(rows, "en").map((row) => row.label)).toEqual(["Gamma", "Alpha", "Beta", "Restricted"]);
    expect(shareOfTotal(5, 20)).toBe(0.25);
    expect(shareOfTotal(5, 0)).toBeNull();
    expect(shareOfTotal(-1, 20)).toBeNull();
    expect(shareOfTotal(null, 20)).toBeNull();
  });

  it("numbers ISO weeks by the year that owns their Thursday", () => {
    expect(isoWeek("2025-12-29")).toEqual({ week: 1, year: 2026 });
    expect(isoWeek("2026-01-05")).toEqual({ week: 2, year: 2026 });
    expect(isoWeek("2026-12-28")).toEqual({ week: 53, year: 2026 });
    expect(isoWeek("2027-01-04")).toEqual({ week: 1, year: 2027 });
  });

  it("treats zero-probability options as lost only when the field carries probabilities", () => {
    expect([
      ...closedLostOptionIds([
        { id: "open", probability: "30" },
        { id: "won", probability: "100" },
        { id: "lost", probability: "0" },
        { id: "abandoned", probability: "0.0" },
        { id: "unrated" },
      ]),
    ]).toEqual(["lost", "abandoned"]);
    expect(closedLostOptionIds([{ id: "a" }, { id: "b", probability: null }]).size).toBe(0);
    expect(isIntegerSeries([0, 2, 3])).toBe(true);
    expect(isIntegerSeries([0, 2.5])).toBe(false);
  });

  it("orders choice groups by option order, keeps unknown groups next and the missing group last", () => {
    const rows = [
      { optionId: "proposal", missing: false },
      { optionId: null, missing: true },
      { optionId: "new", missing: false },
      { optionId: "archived", missing: false },
      { optionId: "qualified", missing: false },
    ];
    const ordered = orderByOptionPosition(
      rows,
      ["new", "qualified", "proposal"],
      (row) => row.optionId,
      (row) => row.missing,
    );
    expect(ordered.map((row) => row.optionId)).toEqual(["new", "qualified", "proposal", "archived", null]);
    expect(
      orderByOptionPosition(
        ["P3", "P2", "P4", "P1"],
        ["P1", "P2", "P3", "P4"],
        (row) => row,
        () => false,
      ),
    ).toEqual(["P1", "P2", "P3", "P4"]);
    expect(
      orderByOptionPosition(
        ["b", "a"],
        [],
        () => null,
        () => false,
      ),
    ).toEqual(["b", "a"]);
  });
});
