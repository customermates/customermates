import { describe, expect, it } from "vitest";

import { PlannerConfigSchema } from "@/features/planner/planner.schema";
import { presetId } from "@/features/records/crm-preset";

import { SEED_IDS } from "../seeds/context";
import { NORTHWIND_MEMBER_IDS } from "../seeds/northwind-model";
import { northwindPlannerConfig } from "../seeds/planner";

const id = (key: string) => presetId(SEED_IDS.company, key);

describe("synthetic calendars", () => {
  it("opens the admin's calendar on the month with three calm sources: timed tasks, open deals and own onboardings", () => {
    const config = northwindPlannerConfig(SEED_IDS.company, "maxBergmann");
    expect(PlannerConfigSchema.parse(config)).toEqual(config);
    expect(config.mode).toBe("month");
    expect(config.sources.map(({ typeId, calendar, color, enabled }) => [typeId, calendar, color, enabled])).toEqual([
      [id("task"), { dateFieldId: id("task.scheduled") }, "secondary", true],
      [id("deal"), { dateFieldId: id("deal.closeDate") }, "success", true],
      [id("onboarding"), { dateFieldId: id("onboarding.timeline") }, "info", true],
    ]);
    expect(config.sources[1].filters).toEqual([
      {
        field: id("deal.stage"),
        operator: "in",
        value: [id("deal.stage.new"), id("deal.stage.qualified"), id("deal.stage.proposal")],
      },
    ]);
    expect(config.sources[2].filters).toEqual([
      { field: id("onboarding.owner"), operator: "in", value: [NORTHWIND_MEMBER_IDS.maxBergmann] },
    ]);
  });

  it("leaves out lists a member cannot read and keeps source ids stable across members", () => {
    const kian = northwindPlannerConfig(SEED_IDS.company, "kianRahimi");
    expect(kian.sources.map(({ typeId }) => typeId)).not.toContain(id("deal"));
    const max = northwindPlannerConfig(SEED_IDS.company, "maxBergmann");
    for (const source of kian.sources)
      expect(max.sources.find(({ typeId }) => typeId === source.typeId)?.id).toBe(source.id);
  });
});
