import type { LegacyModel } from "../v2/legacy-model";
import { LEGACY_TYPES } from "../v2/legacy-model";
import { presetId } from "../v2/contract/crm-preset";
import { migratedActivityPaths } from "../v4/activity-paths";
import { RecordModelSchema } from "./contract/record-model.schema";
import { validateRecordModel } from "./contract/record-model-validation";
import { presentationTypeDefaults } from "./columns";

export function presentationMigrationModel(source: LegacyModel) {
  const model = RecordModelSchema.parse({
    ...source.model,
    revision: 3,
    activityPaths: migratedActivityPaths(source.companyId, source.model),
  });
  const id = (key: string) => presetId(source.companyId, key);
  for (const kind of LEGACY_TYPES) {
    const type = model.types.find((type) => type.id === id(kind));
    if (!type) throw new Error("Missing legacy record type");
    type.defaults = presentationTypeDefaults(source, kind);
    if (kind === "deal" || kind === "service") {
      const target = kind === "deal" ? "service" : "deal";
      const targetType = model.types.find((type) => type.id === id(target));
      if (!targetType) throw new Error("Missing legacy relationship target");
      type.relationshipPaths = [
        {
          id: id(`${kind}.${target}s.path`),
          label: targetType.pluralLabel,
          archived: false,
          path: [
            { relationId: id(`lineItem.${kind}`), direction: "incoming" },
            { relationId: id(`lineItem.${target}`), direction: "outgoing" },
          ],
        },
      ];
    }
  }
  const validation = validateRecordModel(model);
  if (validation.issues.length)
    throw new Error(`Invalid migrated presentation model: ${JSON.stringify(validation.issues)}`);
  return model;
}
