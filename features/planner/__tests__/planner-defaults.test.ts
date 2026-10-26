import { describe, expect, it } from "vitest";

import type { RecordModelView } from "@/features/records/record-model.schema";

import { defaultPlannerConfig, PLANNER_SOURCE_LIMIT } from "../planner.schema";

type Model = Pick<RecordModelView, "types" | "fields">;

const type = (id: string, overrides: Partial<Model["types"][number]> = {}) =>
  ({ id, archived: false, embedded: false, ...overrides }) as Model["types"][number];
const field = (id: string, typeId: string, valueType: string, overrides: Partial<Model["fields"][number]> = {}) =>
  ({ id, typeId, valueType, multiple: false, archived: false, ...overrides }) as Model["fields"][number];
const uuid = (index: number) => `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`;

describe("defaultPlannerConfig", () => {
  it("takes the first usable date field of every active list in the list color", () => {
    const config = defaultPlannerConfig({
      types: [
        type(uuid(1), { color: "success" }),
        type(uuid(2)),
        type(uuid(3), { archived: true }),
        type(uuid(4), { embedded: true }),
        type(uuid(5)),
      ],
      fields: [
        field(uuid(11), uuid(1), "text"),
        field(uuid(12), uuid(1), "date", { archived: true }),
        field(uuid(13), uuid(1), "dateTime"),
        field(uuid(14), uuid(1), "date"),
        field(uuid(21), uuid(2), "dateRange"),
        field(uuid(31), uuid(3), "date"),
        field(uuid(41), uuid(4), "date"),
        field(uuid(51), uuid(5), "date", { multiple: true }),
      ],
    });
    expect(config).toEqual({
      sources: [
        {
          id: uuid(13),
          typeId: uuid(1),
          calendar: { dateFieldId: uuid(13) },
          filters: [],
          enabled: true,
          color: "success",
        },
        {
          id: uuid(21),
          typeId: uuid(2),
          calendar: { dateFieldId: uuid(21) },
          filters: [],
          enabled: true,
          color: "default",
        },
      ],
      calendarIds: [],
      timeZone: "UTC",
      mode: "month",
    });
  });

  it("stops at the source limit", () => {
    const ids = Array.from({ length: PLANNER_SOURCE_LIMIT + 3 }, (_, index) => index + 1);
    const config = defaultPlannerConfig({
      types: ids.map((index) => type(uuid(index))),
      fields: ids.map((index) => field(uuid(100 + index), uuid(index), "date")),
    });
    expect(config.sources.map((source) => source.typeId)).toEqual(
      ids.slice(0, PLANNER_SOURCE_LIMIT).map((index) => uuid(index)),
    );
  });
});
