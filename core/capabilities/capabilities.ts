export const CAPABILITIES = ["forms", "rules", "calendarWrite", "notifications", "incomingWebhooks"] as const;

export type Capability = (typeof CAPABILITIES)[number];
