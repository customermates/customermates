import type { AuditChange } from "@/features/event/audit-changes";
import type { RecordModel } from "@/features/records/record-model.schema";
import type { RecordRevisionChange } from "@/features/records/record-revision.schema";

type Operation = NonNullable<RecordRevisionChange["configuration"]>["operations"][number];

const EVENTS = {
  configuration: "record_model.updated",
  role: "record_grants.updated",
  initialization: "record_model.initialized",
} as const;

export function configurationActivity(
  change: RecordRevisionChange,
  model: RecordModel,
  roleNames: ReadonlyMap<string, string>,
): { event: (typeof EVENTS)[keyof typeof EVENTS]; changes: AuditChange[] } {
  const ids = new Map(change.references.map((entry) => [entry.reference, entry.id]));
  const resolve = (reference: string) => ids.get(reference) ?? reference;
  const typeLabel = (reference: string) =>
    model.types.find((type) => type.id === resolve(reference))?.pluralLabel ?? reference;
  const fieldLabel = (reference: string) =>
    model.fields.find((field) => field.id === resolve(reference))?.label ?? reference;
  const name = (operation: Operation): string => {
    switch (operation.operation) {
      case "createType":
        return operation.pluralLabel;
      case "putType":
        return operation.type.pluralLabel;
      case "putField":
        return `${typeLabel(operation.field.typeId)} · ${operation.field.label}`;
      case "putRelationship":
        return `${operation.relationship.sourceLabel} · ${operation.relationship.targetLabel}`;
      case "putAccessPreset":
        return operation.preset.label;
      case "putCapability":
        return typeLabel(operation.capability.typeId);
      case "putActivityPath":
        return `${typeLabel(operation.activityPath.typeId)} · ${operation.activityPath.label}`;
      case "publishSummary":
        return fieldLabel(operation.fieldId);
      case "setTypeGrants":
        return typeLabel(operation.typeId);
    }
  };
  const grants = (entries: RecordRevisionChange["grants"][number]["before"]) =>
    entries.map((grant) => ({ role: roleNames.get(grant.roleId) ?? grant.roleId, actions: grant.actions }));
  const source = change.source;
  return {
    event: EVENTS[source.kind],
    changes: [
      ...(source.kind === "role"
        ? [
            {
              field: "role",
              snapshot: true,
              previous: undefined,
              current: roleNames.get(source.roleId) ?? source.roleId,
            },
          ]
        : []),
      ...(change.configuration?.operations ?? [])
        .filter((operation) => operation.operation !== "setTypeGrants")
        .map((operation) => ({
          field: operation.operation,
          snapshot: true,
          previous: undefined,
          current: name(operation),
        })),
      ...change.grants.map((grant) => ({
        field: "grants",
        label: typeLabel(grant.typeId),
        previous: grants(grant.before),
        current: grants(grant.after),
      })),
    ],
  };
}
