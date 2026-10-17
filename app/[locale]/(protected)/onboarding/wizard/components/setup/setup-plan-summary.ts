import type { ChipColor } from "@/constants/chip-colors";
import type { SetupOption, SetupPlan } from "@/features/workspace-setup/setup-plan.schema";
import type { StoredSetupResults } from "@/ee/workspace-setup/workspace-setup.schema";

import { setupRoleList } from "@/features/workspace-setup/setup-anchors";

export type PlanField = { key: string; label: string; valueType: string };

export type PlanListSummary = {
  key: string;
  label: string;
  icon: string;
  color: ChipColor | null;
  fields: PlanField[];
  sampleCount: number;
};

export type PlanStage = { key: string; label: string; color: ChipColor | null; weight: number | null };

export type PlanBoard = { list: string; field: string; stages: PlanStage[] };

export type SetupPreviewList = {
  key: string;
  label: string | null;
  icon: string;
  color: ChipColor | null;
  stages: string[];
  ready: boolean;
};

function listOfField(fieldKey: string): string {
  return fieldKey.split(".")[0] ?? fieldKey;
}

export function planLists(plan: SetupPlan): PlanListSummary[] {
  const lists = new Map<string, PlanListSummary>(
    plan.recordModel.lists.map((list) => [
      list.key,
      {
        key: list.key,
        label: list.pluralLabel,
        icon: list.icon,
        color: list.color ?? null,
        fields: [],
        sampleCount: 0,
      },
    ]),
  );
  for (const field of [...plan.recordModel.fields, ...plan.recordModel.calculations])
    lists.get(listOfField(field.key))?.fields.push({ key: field.key, label: field.label, valueType: field.valueType });
  for (const sample of plan.sampleData.lists) {
    const list = lists.get(sample.list);
    if (list) list.sampleCount += sample.count;
  }
  return [...lists.values()];
}

function stagesOf(options: SetupOption[]): PlanStage[] {
  return options.map((option) => ({
    key: option.key,
    label: option.label,
    color: option.color ?? null,
    weight: option.weight ?? null,
  }));
}

export function planBoards(plan: SetupPlan): PlanBoard[] {
  const options = new Map<string, SetupOption[]>();
  for (const field of plan.recordModel.fields)
    if (field.valueType === "select" && field.options.length) options.set(field.key, field.options);
  const boards: PlanBoard[] = [];
  for (const view of plan.listDefaults) {
    const stages = view.layout === "board" && view.groupBy ? options.get(view.groupBy) : undefined;
    if (view.groupBy && stages) boards.push({ list: view.list, field: view.groupBy, stages: stagesOf(stages) });
  }
  const deals = setupRoleList(plan, "deals");
  const pipeline = plan.recordModel.fields.find(
    (field) =>
      listOfField(field.key) === deals &&
      field.options.some((option) => option.weight !== undefined || option.outcome !== undefined),
  );
  if (deals && pipeline && !boards.some((board) => board.field === pipeline.key))
    boards.unshift({ list: deals, field: pipeline.key, stages: stagesOf(pipeline.options) });
  return boards;
}

export function previewLists(plan: SetupPlan | null, results: StoredSetupResults): SetupPreviewList[] {
  const planned = plan ? planLists(plan) : [];
  const boards = plan ? planBoards(plan) : [];
  const built = new Map(results.lists.map((list) => [list.key, list]));
  const keys = [...new Set([...planned.map((list) => list.key), ...results.lists.map((list) => list.key)])];
  return keys.map((key) => {
    const fromPlan = planned.find((list) => list.key === key);
    const result = built.get(key);
    return {
      key,
      label: result?.pluralName ?? fromPlan?.label ?? null,
      icon: result?.icon ?? fromPlan?.icon ?? "list",
      color: (result?.color as ChipColor | null | undefined) ?? fromPlan?.color ?? null,
      stages: result?.stages.length
        ? result.stages
        : (boards.find((board) => board.list === key)?.stages.map((stage) => stage.label) ?? []),
      ready: Boolean(result),
    };
  });
}
