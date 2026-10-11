import type { RecordModel } from "@/features/records/record-model.schema";
import type { SetupPlan } from "@/features/workspace-setup/setup-plan.schema";
import type { SetupViewDraft } from "@/features/workspace-setup/setup-view-compiler";
import type { StoredSetupResults } from "./workspace-setup.schema";

import { z } from "zod";

import { presetId } from "@/features/records/crm-preset";
import {
  SpreadsheetMappingSchema,
  SpreadsheetTableSchema,
} from "@/features/data-transfer/spreadsheet/spreadsheet.schema";
import { AgentDataViewStateSchema } from "@/features/data-view/manage-data-views.schema";
import { RecordWidgetInputSchema } from "@/features/widget/record-widget.schema";
import { isSetupPresetList } from "@/features/workspace-setup/setup-preset-keys";
import { setupListReference } from "@/features/workspace-setup/setup-references";

export const SetupReferencesSchema = z.array(z.object({ reference: z.string(), id: z.uuid() }).strict());
export type SetupReferences = z.infer<typeof SetupReferencesSchema>;

export const SetupViewDraftsSchema = z.array(
  z
    .object({
      action: z.literal("create"),
      surfaceKey: z.string().regex(/^records:[0-9a-f-]{36}$/),
      name: z.string().min(1),
      state: AgentDataViewStateSchema,
    })
    .strict(),
) as unknown as z.ZodType<SetupViewDraft[]>;

export const SetupWidgetInputsSchema = z.array(RecordWidgetInputSchema);

export const SetupSamplesSchema = z.array(
  z
    .object({
      list: z.string(),
      typeId: z.uuid(),
      table: SpreadsheetTableSchema,
      mapping: SpreadsheetMappingSchema,
      titles: z.array(z.string()),
    })
    .strict(),
);

type Kind = "list" | "field" | "relationship";

function kindOf(reference: string): Kind | null {
  if (reference.startsWith("$rel.")) return "relationship";
  if (reference.startsWith("$field.")) return "field";
  if (reference.startsWith("$list.")) return reference.endsWith(".name") ? "field" : "list";
  return null;
}

export function createdIdsOf(references: SetupReferences, model: RecordModel, kind: Kind): string[] {
  const live =
    kind === "list"
      ? new Set(model.types.map((type) => type.id))
      : kind === "field"
        ? new Set(model.fields.map((field) => field.id))
        : new Set(model.relationships.map((relation) => relation.id));
  return references.filter((entry) => kindOf(entry.reference) === kind && live.has(entry.id)).map((entry) => entry.id);
}

export function setupResultLists(
  plan: SetupPlan,
  model: RecordModel,
  references: SetupReferences,
  companyId: string,
): StoredSetupResults["lists"] {
  const ids = new Map(references.map((entry) => [entry.reference, entry.id]));
  const keys = [
    ...plan.recordModel.lists.map((list) => ({
      key: list.key,
      id: ids.get(setupListReference(list.key)),
      created: true,
    })),
    ...[
      ...new Set([
        ...plan.recordModel.listChanges.map((change) => change.list),
        ...plan.recordModel.fieldChanges.map((change) => change.field.split(".")[0]),
        ...plan.recordModel.fields.map((field) => field.key.split(".")[0]),
      ]),
    ]
      .filter(isSetupPresetList)
      .map((key) => ({ key, id: presetId(companyId, key), created: false })),
  ];
  return keys.flatMap(({ key, id, created }) => {
    const type = model.types.find((candidate) => candidate.id === id && !candidate.archived);
    if (!type) return [];
    const choices = model.fields
      .filter((field) => field.typeId === type.id && !field.archived && field.valueType === "select")
      .sort((left, right) => left.position - right.position);
    const staged =
      choices.find((field) =>
        field.options.some((option) => option.attributes.some((entry) => entry.key === "probability")),
      ) ?? choices[0];
    return [
      {
        id: type.id,
        key,
        name: type.label,
        pluralName: type.pluralLabel,
        icon: type.icon ?? null,
        color: type.color ?? null,
        created,
        stages: staged?.options.map((option) => option.label) ?? [],
      },
    ];
  });
}
