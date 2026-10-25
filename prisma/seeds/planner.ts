import { FilterOperatorKey } from "@/core/base/base-query-builder";
import {
  PLANNER_P13N_ID,
  PlannerConfigSchema,
  type PlannerConfig,
  type PlannerSource,
} from "@/features/planner/planner.schema";

import type { SeedContext } from "./context";
import { fixtureId } from "./helpers";
import { NORTHWIND_MEMBER_IDS, northwindModelIds } from "./northwind-model";
import { readableLists } from "./sidebar";

export const SYNTHETIC_PLANNER_P13N_ID_PREFIX = "4e200000";
const SYNTHETIC_PLANNER_SOURCE_ID_PREFIX = "4e300000";

type MemberKey = keyof typeof NORTHWIND_MEMBER_IDS;

/**
 * A member's calendar: their scheduled tasks (timed), the expected close dates of open deals (all-day) and the
 * onboarding projects they own (date ranges), in three calm colours. Lists the member cannot read are left out.
 */
export function northwindPlannerConfig(companyId: string, member: MemberKey): PlannerConfig {
  const { types, fields, options } = northwindModelIds(companyId);
  const stage = options["deal.stage"];
  const readable = readableLists(member);
  const sources: Array<{ list: "task" | "deal" | "onboarding"; source: Omit<PlannerSource, "id" | "enabled"> }> = [
    {
      list: "task",
      source: { typeId: types.task, calendar: { dateFieldId: fields.task.scheduled }, filters: [], color: "secondary" },
    },
    {
      list: "deal",
      source: {
        typeId: types.deal,
        calendar: { dateFieldId: fields.deal.closeDate },
        filters: [
          {
            field: fields.deal.stage,
            operator: FilterOperatorKey.in,
            value: [stage.new, stage.qualified, stage.proposal],
          },
        ],
        color: "success",
      },
    },
    {
      list: "onboarding",
      source: {
        typeId: types.onboarding,
        calendar: { dateFieldId: fields.onboarding.timeline },
        filters: [
          { field: fields.onboarding.owner, operator: FilterOperatorKey.in, value: [NORTHWIND_MEMBER_IDS[member]] },
        ],
        color: "info",
      },
    },
  ];
  return PlannerConfigSchema.parse({
    sources: sources.flatMap(({ list, source }, index) =>
      readable.has(list)
        ? [{ id: fixtureId(SYNTHETIC_PLANNER_SOURCE_ID_PREFIX, index + 1), enabled: true, ...source }]
        : [],
    ),
    calendarIds: [],
    timeZone: "Europe/Berlin",
    mode: "month",
  });
}

export async function seedPlanners(context: SeedContext): Promise<void> {
  const companyId = context.ids.company;
  const members = Object.keys(NORTHWIND_MEMBER_IDS) as MemberKey[];
  for (const [index, member] of members.entries()) {
    const userId = NORTHWIND_MEMBER_IDS[member];
    const data = { companyId, userId, p13nId: PLANNER_P13N_ID, settings: northwindPlannerConfig(companyId, member) };
    await context.prisma.p13n.upsert({
      where: { companyId_userId_p13nId: { companyId, userId, p13nId: PLANNER_P13N_ID } },
      create: { id: fixtureId(SYNTHETIC_PLANNER_P13N_ID_PREFIX, index + 1), ...data },
      update: data,
    });
  }
}
