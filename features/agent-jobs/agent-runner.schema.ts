import type { Data } from "@/core/validation/validation.utils";

import { z } from "zod";

export const AGENT_RUNNER_ONLINE_WINDOW_MS = 2 * 60 * 1000;

export const AgentRunnerDtoSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  machine: z.string().nullable(),
  lastSeenAt: z.string().nullable(),
  online: z.boolean(),
});
export type AgentRunnerDto = Data<typeof AgentRunnerDtoSchema>;

export const AgentRunnerListSchema = z.object({ runners: z.array(AgentRunnerDtoSchema) });
export type AgentRunnerList = Data<typeof AgentRunnerListSchema>;

export function isAgentRunnerOnline(lastSeenAt: Date | null, now: Date): boolean {
  return lastSeenAt !== null && lastSeenAt.getTime() >= now.getTime() - AGENT_RUNNER_ONLINE_WINDOW_MS;
}
