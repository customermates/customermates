import type { ConfigurationPreview } from "@/features/records/configuration.schema";
import type { RecordField, RecordModel } from "@/features/records/record-model.schema";
import type { SetupPlan } from "./setup-plan.schema";

import { presetId } from "@/features/records/crm-preset";

import {
  SETUP_PRESET_FIELDS,
  isSetupPresetField,
  isSetupPresetList,
  isSetupPresetRelationship,
} from "./setup-preset-keys";

export type SetupCompileIssue = { code: string; path: string };
export type SetupCompileResult<T> = { ok: true; data: T } | { ok: false; issues: SetupCompileIssue[] };

export const SETUP_SYSTEM_COLUMNS = ["system:createdAt", "system:updatedAt", "system:assignedTo"] as const;

export function setupListReference(key: string): string {
  return `$list.${key}`;
}

export function setupNameReference(key: string): string {
  return `${setupListReference(key)}.name`;
}

export function setupFieldReference(key: string): string {
  return `$field.${key}`;
}

export function setupRelationshipReference(key: string): string {
  return `$rel.${key}`;
}

export function setupIdempotencyKey(setupId: string, part: string): string {
  return `workspace-setup:${setupId}:${part}`;
}

export function isSetupSystemColumn(ref: string): ref is (typeof SETUP_SYSTEM_COLUMNS)[number] {
  return (SETUP_SYSTEM_COLUMNS as readonly string[]).includes(ref);
}

export function presetOptionId(
  companyId: string,
  field: RecordField,
  presetKey: string,
  key: string,
): string | undefined {
  const candidates = [presetId(companyId, `${presetKey}.${key}`), key];
  return field.options.find((option) => candidates.includes(option.id))?.id;
}

export type SetupResolver = {
  list(key: string): string | undefined;
  field(ref: string): string | undefined;
  relationship(ref: string): string | undefined;
  option(fieldRef: string, key: string): string | undefined;
  definition(ref: string): RecordField | undefined;
};

export function createSetupResolver(
  plan: SetupPlan,
  context: { companyId: string; model: RecordModel; references: ConfigurationPreview["references"] },
): SetupResolver {
  const references = new Map(context.references.map((entry) => [entry.reference, entry.id]));
  const lists = new Set(plan.recordModel.lists.map((list) => list.key));
  const live = <T extends { id: string; archived: boolean }>(items: T[], id: string | undefined) =>
    id && items.some((item) => item.id === id && !item.archived) ? id : undefined;
  const list = (key: string) =>
    live(
      context.model.types,
      isSetupPresetList(key)
        ? presetId(context.companyId, key)
        : lists.has(key)
          ? references.get(setupListReference(key))
          : undefined,
    );
  const field = (ref: string) => {
    if (isSetupSystemColumn(ref)) return ref;
    const [owner, name] = ref.split(".");
    const id = isSetupPresetField(ref)
      ? presetId(context.companyId, SETUP_PRESET_FIELDS[ref])
      : lists.has(owner) && name === "name"
        ? references.get(setupNameReference(owner))
        : references.get(setupFieldReference(ref));
    return live(context.model.fields, id);
  };
  const definition = (ref: string) => {
    const id = field(ref);
    return context.model.fields.find((candidate) => candidate.id === id);
  };
  return {
    list,
    field,
    definition,
    relationship: (ref) =>
      live(
        context.model.relationships,
        isSetupPresetRelationship(ref)
          ? presetId(context.companyId, ref)
          : references.get(setupRelationshipReference(ref)),
      ),
    option: (fieldRef, key) => {
      const target = definition(fieldRef);
      if (!target) return undefined;
      return isSetupPresetField(fieldRef)
        ? presetOptionId(context.companyId, target, SETUP_PRESET_FIELDS[fieldRef], key)
        : target.options.find((option) => option.id === key)?.id;
    },
  };
}
