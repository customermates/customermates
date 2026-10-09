import type { RecordModel } from "@/features/records/record-model.schema";
import type { RecordViewName } from "./command-catalog.repo";

export type CommandCatalogAccess = { canManageSchema: boolean; canReadType: (typeId: string) => boolean };

export function commandCatalogScope(
  model: RecordModel,
  access: CommandCatalogAccess,
  views: readonly RecordViewName[],
) {
  const lists = model.types
    .filter((type) => !type.archived && !type.embedded && type.navigationVisible && access.canReadType(type.id))
    .map((type) => type.id);
  const navigable = new Set(lists);
  return {
    lists,
    views: views.filter((view) => navigable.has(view.typeId)),
    fields: access.canManageSchema
      ? model.fields
          .filter((field) => !field.archived && navigable.has(field.typeId))
          .map((field) => ({ typeId: field.typeId, id: field.id, label: field.label }))
      : [],
  };
}
