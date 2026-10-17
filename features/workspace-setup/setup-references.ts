import type { ConfigurationPreview } from "@/features/records/configuration.schema";
import type { RecordField, RecordModel } from "@/features/records/record-model.schema";
import type { SetupPlan } from "./setup-plan.schema";

import { setupAnchorFields } from "./setup-anchors";

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

export function setupCapabilityReference(key: string): string {
  return `$cap.${key}`;
}

export function setupPathReference(key: string): string {
  return `$path.${key}`;
}

export function setupIdempotencyKey(setupId: string, part: string): string {
  return `workspace-setup:${setupId}:${part}`;
}

export function isSetupSystemColumn(ref: string): ref is (typeof SETUP_SYSTEM_COLUMNS)[number] {
  return (SETUP_SYSTEM_COLUMNS as readonly string[]).includes(ref);
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
  context: { model: RecordModel; references: ConfigurationPreview["references"] },
): SetupResolver {
  const references = new Map(context.references.map((entry) => [entry.reference, entry.id]));
  const lists = new Set(plan.recordModel.lists.map((list) => list.key));
  const fields = new Set([
    ...plan.recordModel.fields.map((field) => field.key),
    ...plan.recordModel.calculations.map((field) => field.key),
    ...setupAnchorFields(plan.recordModel.lists),
  ]);
  const relationships = new Set(plan.recordModel.relationships.map((relation) => relation.key));
  const live = <T extends { id: string; archived: boolean }>(items: T[], id: string | undefined) =>
    id && items.some((item) => item.id === id && !item.archived) ? id : undefined;
  const field = (ref: string) => {
    if (isSetupSystemColumn(ref)) return ref;
    const [owner, name] = ref.split(".");
    const id =
      lists.has(owner) && name === "name"
        ? references.get(setupNameReference(owner))
        : fields.has(ref)
          ? references.get(setupFieldReference(ref))
          : undefined;
    return live(context.model.fields, id);
  };
  const definition = (ref: string) => {
    const id = field(ref);
    return context.model.fields.find((candidate) => candidate.id === id);
  };
  return {
    list: (key) => live(context.model.types, lists.has(key) ? references.get(setupListReference(key)) : undefined),
    field,
    definition,
    relationship: (ref) =>
      live(
        context.model.relationships,
        relationships.has(ref) ? references.get(setupRelationshipReference(ref)) : undefined,
      ),
    option: (fieldRef, key) => definition(fieldRef)?.options.find((option) => option.id === key)?.id,
  };
}
