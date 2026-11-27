import type { SetupPlan } from "@/features/workspace-setup/setup-plan.schema";

type PlanListSummary = { key: string; label: string; sampleCount: number };

export function planLists(plan: SetupPlan): PlanListSummary[] {
  const lists = new Map<string, PlanListSummary>(
    plan.recordModel.lists.map((list) => [list.key, { key: list.key, label: list.pluralLabel, sampleCount: 0 }]),
  );
  for (const sample of plan.sampleData.lists) {
    const list = lists.get(sample.list);
    if (list) list.sampleCount += sample.count;
  }
  return [...lists.values()];
}
