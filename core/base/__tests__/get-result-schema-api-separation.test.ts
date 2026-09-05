import { describe, expect, it } from "vitest";
import { z } from "zod";

import { ActivitiesResultSchema, ActivitiesViewResultSchema } from "@/ee/messaging/activities/activities.schema";

import { DataViewResultFields, createApiGetResultSchema, createGetResultSchema } from "../base-get.schema";

const ItemSchema = z.object({ id: z.string() });
const DATA_VIEW_KEYS = Object.keys(DataViewResultFields);

const resultCarryingViewFields = {
  items: [{ id: "one" }],
  views: [{ id: "a", name: "Hot leads" }],
  activeViewKey: "__all__",
  viewPersistable: true,
};

describe("the documented REST result schema stays free of data view state", () => {
  it("declares none of the data view keys, so public/v1/openapi.json cannot grow them", () => {
    const shape = Object.keys(createApiGetResultSchema(ItemSchema).shape);

    expect(DATA_VIEW_KEYS.filter((key) => shape.includes(key))).toEqual([]);
  });

  it("strips the data view keys off a result parsed through the documented schema", () => {
    const parsed = createApiGetResultSchema(ItemSchema).parse(resultCarryingViewFields);

    expect(DATA_VIEW_KEYS.filter((key) => key in parsed)).toEqual([]);
  });

  it("keeps every data view key on the interactive schema the read path validates with", () => {
    const parsed = createGetResultSchema(ItemSchema).parse(resultCarryingViewFields);

    expect(DATA_VIEW_KEYS.filter((key) => key in parsed).sort()).toEqual([...DATA_VIEW_KEYS].sort());
  });

  it("keeps the same separation on the two activity result schemas", () => {
    const activityResult = {
      ...resultCarryingViewFields,
      items: [],
      availableSources: [],
      pageLimitReached: false,
      scopeTruncated: false,
    };
    const documented = ActivitiesResultSchema.parse(activityResult);
    const interactive = ActivitiesViewResultSchema.parse(activityResult);

    expect(DATA_VIEW_KEYS.filter((key) => key in documented)).toEqual([]);
    expect(DATA_VIEW_KEYS.filter((key) => key in interactive).sort()).toEqual([...DATA_VIEW_KEYS].sort());
  });
});
