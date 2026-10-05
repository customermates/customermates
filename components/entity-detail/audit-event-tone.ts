type AuditEventTone = "created" | "updated" | "deleted" | "other";

export function auditEventTone(event: string): AuditEventTone {
  if (event.endsWith(".created")) return "created";
  if (event.endsWith(".updated")) return "updated";
  if (event.endsWith(".deleted")) return "deleted";
  return "other";
}

export function auditToneRingClass(tone: AuditEventTone): string {
  if (tone === "created") return "outline outline-2 outline-success/60";
  if (tone === "deleted") return "outline outline-2 outline-destructive/60";
  if (tone === "updated") return "outline outline-2 outline-primary/60";
  return "";
}
