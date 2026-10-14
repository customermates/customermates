import type { RecordModel } from "./record-model.schema";

export function liveRecordModel(model: RecordModel): RecordModel {
  const types = new Set(model.types.filter((type) => !type.archived).map((type) => type.id));
  const relationships = model.relationships.filter(
    (relation) => !relation.archived && types.has(relation.sourceTypeId) && types.has(relation.targetTypeId),
  );
  return {
    ...model,
    types: model.types
      .filter((type) => types.has(type.id))
      .map((type) =>
        type.relationshipPaths
          ? { ...type, relationshipPaths: type.relationshipPaths.filter((path) => !path.archived) }
          : type,
      ),
    fields: model.fields.filter((field) => !field.archived && types.has(field.typeId)),
    relationships,
    capabilities: model.capabilities.filter((binding) => types.has(binding.typeId)),
  };
}
