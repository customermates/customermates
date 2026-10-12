type AuditEventTone = "created" | "updated" | "deleted" | "other";

export function auditEventTone(event: string): AuditEventTone {
  if (event.endsWith(".created")) return "created";
  if (event.endsWith(".updated")) return "updated";
  if (event.endsWith(".deleted")) return "deleted";
  return "other";
}
