import type { ChipColor } from "@/constants/chip-colors";
import type { SetupOption, SetupPlan } from "@/features/workspace-setup/setup-plan.schema";
import type { StoredSetupResults } from "@/ee/workspace-setup/workspace-setup.schema";

export const STANDARD_SETUP_LISTS = ["contact", "organization", "deal", "service", "task", "lineItem"] as const;
export type StandardSetupList = (typeof STANDARD_SETUP_LISTS)[number];

const ALWAYS_SHOWN_STANDARD_LISTS: readonly StandardSetupList[] = [
  "contact",
  "organization",
  "deal",
  "service",
  "task",
];
const STANDARD_LIST_ICONS: Record<StandardSetupList, string> = {
  contact: "contact",
  organization: "building",
  deal: "handshake",
  service: "package",
  task: "check",
  lineItem: "list",
};

export type PlanField = { key: string; label: string; valueType: string };

export type PlanListSummary = {
  key: string;
  label: string | null;
  standard: StandardSetupList | null;
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
  standard: StandardSetupList | null;
  icon: string;
  color: ChipColor | null;
  stages: string[];
  ready: boolean;
};

export function isStandardSetupList(key: string): key is StandardSetupList {
  return (STANDARD_SETUP_LISTS as readonly string[]).includes(key);
}

function listOfField(fieldKey: string): string {
  return fieldKey.split(".")[0] ?? fieldKey;
}

export function planLists(plan: SetupPlan): PlanListSummary[] {
  const lists = new Map<string, PlanListSummary>();
  const ensure = (key: string): PlanListSummary => {
    const existing = lists.get(key);
    if (existing) return existing;
    const standard = isStandardSetupList(key) ? key : null;
    const created: PlanListSummary = {
      key,
      label: null,
      standard,
      icon: standard ? STANDARD_LIST_ICONS[standard] : "list",
      color: null,
      fields: [],
      sampleCount: 0,
    };
    lists.set(key, created);
    return created;
  };
  for (const key of ALWAYS_SHOWN_STANDARD_LISTS) ensure(key);
  for (const list of plan.recordModel.lists)
    Object.assign(ensure(list.key), { label: list.pluralLabel, icon: list.icon, color: list.color ?? null });
  for (const change of plan.recordModel.listChanges) {
    const list = ensure(change.list);
    if (change.pluralLabel) list.label = change.pluralLabel;
    if (change.icon) list.icon = change.icon;
    if (change.color) list.color = change.color;
  }
  for (const field of [...plan.recordModel.fields, ...plan.recordModel.calculations])
    ensure(listOfField(field.key)).fields.push({ key: field.key, label: field.label, valueType: field.valueType });
  for (const sample of plan.sampleData.lists) ensure(sample.list).sampleCount += sample.count;
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
  for (const change of plan.recordModel.fieldChanges)
    if (change.options?.length) options.set(change.field, change.options);
  const boards: PlanBoard[] = [];
  for (const view of plan.listDefaults) {
    const stages = view.layout === "board" && view.groupBy ? options.get(view.groupBy) : undefined;
    if (view.groupBy && stages) boards.push({ list: view.list, field: view.groupBy, stages: stagesOf(stages) });
  }
  const dealStages = options.get("deal.stage");
  if (dealStages && !boards.some((board) => board.field === "deal.stage"))
    boards.unshift({ list: "deal", field: "deal.stage", stages: stagesOf(dealStages) });
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
    const standard = isStandardSetupList(key) ? key : null;
    return {
      key,
      label: result?.pluralName ?? fromPlan?.label ?? null,
      standard,
      icon: result?.icon ?? fromPlan?.icon ?? (standard ? STANDARD_LIST_ICONS[standard] : "list"),
      color: (result?.color as ChipColor | null | undefined) ?? fromPlan?.color ?? null,
      stages: result?.stages.length
        ? result.stages
        : (boards.find((board) => board.list === key)?.stages.map((stage) => stage.label) ?? []),
      ready: Boolean(result),
    };
  });
}
