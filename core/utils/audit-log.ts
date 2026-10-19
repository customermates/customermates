import "server-only";

export function logAuditEvent(event: string, fields: Record<string, unknown>): void {
  console.info(JSON.stringify({ level: "info", audit: event, at: new Date().toISOString(), ...fields }));
}
