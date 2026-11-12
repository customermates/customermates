export const CAPABILITIES = ["forms", "rules", "calendarWrite", "notifications", "incomingWebhooks"] as const;

export type Capability = (typeof CAPABILITIES)[number];

export const SHIPPED_CAPABILITIES: ReadonlySet<Capability> = new Set<Capability>(["calendarWrite"]);
