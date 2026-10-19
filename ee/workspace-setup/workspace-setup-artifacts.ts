import type { RecordModel } from "@/features/records/record-model.schema";
import type { SetupPlan } from "@/features/workspace-setup/setup-plan.schema";
import type { SetupViewDraft } from "@/features/workspace-setup/setup-view-compiler";
import type { SetupReferences, StoredSetupResults } from "./workspace-setup.schema";

import { z } from "zod";

import {
  SpreadsheetMappingSchema,
  SpreadsheetTableSchema,
} from "@/features/data-transfer/spreadsheet/spreadsheet.schema";
import { RecordSurfaceKeySchema } from "@/core/data-view/data-view-identity.schema";
import { AgentDataViewStateSchema } from "@/features/data-view/manage-data-views.schema";
import { RecordWidgetInputSchema } from "@/features/widget/record-widget.schema";
import { setupListReference } from "@/features/workspace-setup/setup-references";

export const SetupViewDraftsSchema: z.ZodType<SetupViewDraft[]> = z.array(
  z
    .object({
      action: z.literal("create"),
      surfaceKey: RecordSurfaceKeySchema,
      name: z.string().min(1),
      state: AgentDataViewStateSchema,
    })
    .strict(),
);

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

export function setupStageField(model: RecordModel, typeId: string) {
  const choices = model.fields
    .filter((field) => field.typeId === typeId && !field.archived && field.valueType === "select")
    .sort((left, right) => left.position - right.position);
  return (
    choices.find((field) =>
      field.options.some((option) => option.attributes.some((entry) => entry.key === "probability")),
    ) ?? choices[0]
  );
}

export function setupResultLists(
  plan: SetupPlan,
  model: RecordModel,
  references: SetupReferences,
): StoredSetupResults["lists"] {
  const ids = new Map(references.map((entry) => [entry.reference, entry.id]));
  return plan.recordModel.lists.flatMap(({ key }) => {
    const id = ids.get(setupListReference(key));
    const type = model.types.find((candidate) => candidate.id === id && !candidate.archived);
    if (!type) return [];
    const staged = setupStageField(model, type.id);
    return [
      {
        id: type.id,
        key,
        name: type.label,
        pluralName: type.pluralLabel,
        icon: type.icon ?? null,
        color: type.color ?? null,
        stages: staged?.options.map((option) => option.label) ?? [],
      },
    ];
  });
}
