import type { RecordField } from "./record-model.schema";
import { buildTerminologyMap } from "@/features/entity-terminology/entity-terminology.resolver";
import { createCrmPreset, presetId } from "./crm-preset";
import { DEFAULT_SELECT_COLUMNS } from "./crm-preset-options";
import { recordInvariant } from "./record-invariant";

export function createWorkspaceRecordPreset(companyId: string, currency: string, translate: (key: string) => string) {
  const model = createCrmPreset(companyId, currency);
  const id = (key: string) => presetId(companyId, key);
  const terminology = buildTerminologyMap([], translate);
  const labels = new Map<string, { singular: string; plural: string }>();
  for (const [key, label] of Object.entries(terminology)) labels.set(id(key), label);
  labels.set(id("lineItem"), {
    singular: translate("RecordModel.lineItem"),
    plural: translate("RecordModel.lineItems"),
  });
  for (const type of model.types) {
    const label = recordInvariant(labels.get(type.id));
    type.label = label.singular;
    type.pluralLabel = label.plural;
  }
  for (const relation of model.relationships) {
    const source = recordInvariant(labels.get(relation.sourceTypeId));
    const target = recordInvariant(labels.get(relation.targetTypeId));
    relation.sourceLabel = relation.sourceCardinality === "one" ? target.singular : target.plural;
    relation.targetLabel = relation.targetCardinality === "one" ? source.singular : source.plural;
  }
  const fieldLabels = new Map<string, string>();
  for (const key of ["contact", "organization", "deal", "service", "task", "lineItem"]) {
    fieldLabels.set(id(`${key}.name`), "Common.table.columns.name");
    fieldLabels.set(id(`${key}.notes`), "Common.table.columns.notes");
  }
  for (const key of ["firstName", "lastName", "avatarUrl"])
    fieldLabels.set(id(`contact.${key}`), `Common.table.columns.${key}`);

  for (const key of ["totalValue", "totalQuantity", "weightedValue"])
    fieldLabels.set(id(`deal.${key}`), `Common.table.columns.${key}`);

  fieldLabels.set(id("service.amount"), "Common.table.columns.amount");
  for (const key of ["quantity", "pricingMode", "savedPrice", "effectivePrice", "amount"])
    fieldLabels.set(id(`lineItem.${key}`), `RecordModel.lineFields.${key}`);

  for (const field of model.fields) {
    const key = fieldLabels.get(field.id);
    if (key) field.label = translate(key);
  }
  const lineName = recordInvariant(model.fields.find((field) => field.id === id("lineItem.name")));
  lineName.behavior = { kind: "input", defaultValue: { kind: "text", value: translate("RecordModel.lineItem") } };
  const priceMode = recordInvariant(model.fields.find((field) => field.id === id("lineItem.pricingMode")));
  for (const option of priceMode.options) option.label = translate(`RecordModel.priceModes.${option.id}`);

  for (const preset of DEFAULT_SELECT_COLUMNS) {
    const key = `${preset.entityType}.${preset.entityType === "deal" ? "stage" : "status"}`;
    const type = recordInvariant(model.types.find((type) => type.id === id(preset.entityType)));
    const options: RecordField["options"] = preset.options.map((option) => ({
      id: id(`${key}.${option.key}`),
      label: translate(`Common.defaultData.${preset.entityType}.options.${option.key}`),
      color: option.color,
      attributes:
        option.weight === undefined
          ? []
          : [{ key: "probability", value: { kind: "decimal", value: String(option.weight), currency: null } }],
    }));
    const field: RecordField = {
      id: id(key),
      typeId: type.id,
      label: translate(`Common.defaultData.${preset.entityType}.columnLabel`),
      valueType: "select",
      behavior: { kind: "input", defaultValue: { kind: "select", value: recordInvariant(options[0]).id } },
      required: false,
      archived: false,
      publishedSummary: false,
      position: model.fields.filter((field) => field.typeId === type.id).length,
      options,
    };
    model.fields = model.fields.filter((existing) => existing.id !== field.id);
    model.fields.push(field);
    if (!type.defaults.columns.includes(field.id)) type.defaults.columns.push(field.id);
    type.defaults.groupBy = field.id;
  }
  for (const path of model.activityPaths) {
    const last = path.path.at(-1);
    const relationship = model.relationships.find((relation) => relation.id === last?.relationId);
    const typeId =
      relationship && last
        ? last.direction === "outgoing"
          ? relationship.targetTypeId
          : relationship.sourceTypeId
        : path.typeId;
    path.label = recordInvariant(labels.get(typeId)).plural;
  }
  return model;
}
