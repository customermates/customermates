import { z } from "zod";

import { AGENT_RUNTIMES } from "./automation-rule.schema";

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

export function noAgentRuntimes(): AgentRuntimeAvailability {
  return Object.fromEntries(
    AGENT_RUNTIMES.map((runtime) => [runtime, { available: false, reason: "notConfigured", models: [], runners: [] }]),
  ) as AgentRuntimeAvailability;
}
