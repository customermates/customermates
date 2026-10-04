import type { RecordModel } from "../v2/contract/record-model.schema";
import { presetId } from "../v2/contract/crm-preset";

export function migratedActivityPaths(companyId: string, model: RecordModel): RecordModel["activityPaths"] {
  const id = (key: string) => presetId(companyId, key);
  const people = model.types.find((type) => type.id === id("contact"));
  if (!people) throw new Error("Migration requires the preserved person type");
  return [
    ...model.types.map((type) => ({
      id: id(`activities:${type.id}:self`),
      typeId: type.id,
      label: type.pluralLabel,
      path: [],
      includeMessages: type.id === people.id,
      includeAudit: true,
      archived: false,
    })),
    ...[
      { key: "organization", path: [{ relationId: id("contact.organizations"), direction: "incoming" as const }] },
      { key: "deal", path: [{ relationId: id("deal.contacts"), direction: "outgoing" as const }] },
      {
        key: "service",
        path: [
          { relationId: id("lineItem.service"), direction: "incoming" as const },
          { relationId: id("lineItem.deal"), direction: "outgoing" as const },
          { relationId: id("deal.contacts"), direction: "outgoing" as const },
        ],
      },
      { key: "task", path: [{ relationId: id("task.contacts"), direction: "outgoing" as const }] },
    ].map(({ key, path }) => ({
      id: id(`activities:${id(key)}:people`),
      typeId: id(key),
      label: people.pluralLabel,
      path,
      includeMessages: true,
      includeAudit: false,
      archived: false,
    })),
  ];
}
