export type RecordToolRisk = "read" | "write" | "sensitive";

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

const READ_TOOLS = new Set([
  "discover_record_types",
  "get_record_model",
  "query_crm_records",
  "search_crm_records",
  "read_crm_record",
  "preview_crm_deletion",
  "query_crm_measure",
  "read_crm_operation",
]);

function isNewDefinitionReference(id: unknown): boolean {
  return typeof id === "string" && id.startsWith("$");
}

export function recordToolRisk(name: string, input: unknown): RecordToolRisk | null {
  if (READ_TOOLS.has(name)) return "read";
  if (name === "cancel_crm_operation" || name === "resume_crm_operation") return "write";
  const data = object(input);
  if (name === "mutate_crm_record") {
    const action = object(data.mutation).action;
    return typeof action === "string" && ["create", "update", "updateMany", "link", "unlink"].includes(action)
      ? "write"
      : "sensitive";
  }
  if (name !== "configure_record_model") return null;
  if (data.action === "preview") return "read";
  const operations = object(data.change).operations;
  if (data.action !== "apply" || !Array.isArray(operations) || operations.length === 0) return "sensitive";
  for (const raw of operations) {
    const operation = object(raw);
    if (operation.operation === "createType") continue;
    if (operation.operation === "putField") {
      const field = object(operation.field);
      if (field.archived === false && isNewDefinitionReference(field.id)) continue;
    }
    if (operation.operation === "putActivityPath") {
      const activityPath = object(operation.activityPath);
      if (activityPath.archived === false && isNewDefinitionReference(activityPath.id)) continue;
    }
    if (operation.operation === "putRelationship") {
      const relationship = object(operation.relationship);
      if (
        relationship.archived === false &&
        isNewDefinitionReference(relationship.id) &&
        ["unlink", "restrict"].includes(String(relationship.onSourceDelete)) &&
        ["unlink", "restrict"].includes(String(relationship.onTargetDelete))
      )
        continue;
    }
    return "sensitive";
  }
  return "write";
}
