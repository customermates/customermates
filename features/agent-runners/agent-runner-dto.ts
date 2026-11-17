import type { StoredAgentRunner } from "./agent-runner.repo";
import type { AgentRunnerDto } from "./agent-runner.schema";

import { z } from "zod";

import { AGENT_RUNNER_LIMITS, AgentRunnerClientSchema } from "./agent-runner.schema";

const ClientsSchema = z.array(AgentRunnerClientSchema);

export function toAgentRunnerDto(stored: StoredAgentRunner, now: Date): AgentRunnerDto {
  const clients = ClientsSchema.safeParse(stored.clients);
  const online =
    stored.revokedAt === null &&
    stored.lastSeenAt !== null &&
    now.getTime() - stored.lastSeenAt.getTime() <= AGENT_RUNNER_LIMITS.onlineWithinMs;
  return {
    id: stored.id,
    name: stored.name,
    machine: stored.machine,
    clients: clients.success ? clients.data : [],
    lastSeenAt: stored.lastSeenAt?.toISOString() ?? null,
    online,
    revokedAt: stored.revokedAt?.toISOString() ?? null,
    createdById: stored.createdById,
    createdAt: stored.createdAt.toISOString(),
  };
}
