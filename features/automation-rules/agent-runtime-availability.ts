import { z } from "zod";

export const AGENT_RUNTIME_UNAVAILABLE_REASONS = ["selfHosted", "plan", "noKey", "noRunner", "notConfigured"] as const;

export const AgentRuntimeOptionSchema = z.object({
  available: z.boolean(),
  reason: z.enum(AGENT_RUNTIME_UNAVAILABLE_REASONS).nullable(),
  models: z.array(z.object({ id: z.string(), label: z.string() })).default([]),
  runners: z.array(z.object({ id: z.uuid(), name: z.string(), online: z.boolean() })).default([]),
});

export const AgentRuntimeAvailabilitySchema = z.object({
  mate: AgentRuntimeOptionSchema,
  ownKey: AgentRuntimeOptionSchema,
  runner: AgentRuntimeOptionSchema,
});

export type AgentRuntimeOption = z.infer<typeof AgentRuntimeOptionSchema>;
export type AgentRuntimeAvailability = z.infer<typeof AgentRuntimeAvailabilitySchema>;

function notConfigured(): AgentRuntimeOption {
  return { available: false, reason: "notConfigured", models: [], runners: [] };
}

export function noAgentRuntimes(): AgentRuntimeAvailability {
  return { mate: notConfigured(), ownKey: notConfigured(), runner: notConfigured() };
}
