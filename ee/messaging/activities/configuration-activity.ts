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
  models: RecordModel[],
  roleNames: ReadonlyMap<string, string>,
): { event: (typeof EVENTS)[keyof typeof EVENTS]; changes: AuditChange[] } {
  const ids = new Map(change.references.map((entry) => [entry.reference, entry.id]));
  const resolve = (reference: string) => ids.get(reference) ?? reference;
  const typeLabel = (reference: string) =>
    models.flatMap((model) => model.types).find((type) => type.id === resolve(reference))?.pluralLabel ?? reference;
  const fieldLabel = (reference: string) =>
    models.flatMap((model) => model.fields).find((field) => field.id === resolve(reference))?.label ?? reference;
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
      case "delete":
      case "restore":
      case "deletePermanently": {
        const { kind, id } = operation.target;
        if (kind === "type") return typeLabel(id);
        if (kind === "field") {
          const field = models.flatMap((model) => model.fields).find((field) => field.id === id);
          return field ? `${typeLabel(field.typeId)} · ${field.label}` : id;
        }
        if (kind === "relationship") {
          const relation = models.flatMap((model) => model.relationships).find((relation) => relation.id === id);
          return relation ? `${relation.sourceLabel} · ${relation.targetLabel}` : id;
        }
        const path = models.flatMap((model) => model.activityPaths).find((path) => path.id === id);
        return path ? `${typeLabel(path.typeId)} · ${path.label}` : id;
      }
    }
  };
  const source = change.source;
  return {
    event: EVENTS[source.kind],
    changes: [
      ...(change.configuration?.operations ?? [])
        .filter((operation) => operation.operation !== "setTypeGrants")
        .map((operation) => ({
          field: operation.operation,
          snapshot: true,
          previous: undefined,
          current: name(operation),
        })),
      ...change.grants.flatMap((grant) =>
        [...new Set([...grant.before, ...grant.after].map((entry) => entry.roleId))].flatMap((roleId) => {
          const previous = [...(grant.before.find((entry) => entry.roleId === roleId)?.actions ?? [])].sort();
          const current = [...(grant.after.find((entry) => entry.roleId === roleId)?.actions ?? [])].sort();
          if (previous.join() === current.join()) return [];
          return [
            {
              field: "grants",
              label: `${typeLabel(grant.typeId)} · ${roleNames.get(roleId) ?? roleId}`,
              previous,
              current,
            },
          ];
        }),
      ),
    ],
  };
}
