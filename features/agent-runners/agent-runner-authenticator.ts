import type { TokenBucketRateLimiter } from "@/core/network/token-bucket-rate-limiter";
import type { AgentRunnerRepo } from "./agent-runner.repo";
import type { AgentRunnerRevocation } from "./agent-runner-revocation";
import type { AuthenticatedAgentRunner } from "./agent-runner.schema";

import { Status } from "@/generated/prisma";

import { admitAll } from "@/core/network/public-access";

import { agentRunnerTokenFromHeader, hashAgentRunnerToken } from "./agent-runner-token";

export type AgentRunnerCredentials = { authorization: string | null; visitor?: string | null };

export type AgentRunnerLimiters = { runner: TokenBucketRateLimiter; visitor: TokenBucketRateLimiter };

export type AgentRunnerAuthentication =
  | { ok: true; runner: AuthenticatedAgentRunner }
  | { ok: false; reason: "unauthenticated" }
  | { ok: false; reason: "rateLimited"; retryAfterSeconds: number };

const UNAUTHENTICATED: AgentRunnerAuthentication = { ok: false, reason: "unauthenticated" };

export class AgentRunnerAuthenticator {
  constructor(
    private readonly repo: Pick<AgentRunnerRepo, "findRunnerByTokenHashUnscoped">,
    private readonly limiters: AgentRunnerLimiters,
    private readonly revocation: Pick<AgentRunnerRevocation, "revoke">,
    private readonly clock: () => Date = () => new Date(),
  ) {}

  async authenticate(credentials: AgentRunnerCredentials): Promise<AgentRunnerAuthentication> {
    const visitorLimited = admitAll([
      [this.limiters.visitor, credentials.visitor ? `visitor:${credentials.visitor}` : null],
    ]);
    if (visitorLimited)
      return { ok: false, reason: "rateLimited", retryAfterSeconds: visitorLimited.retryAfterSeconds };

    const token = agentRunnerTokenFromHeader(credentials.authorization);
    if (!token) return UNAUTHENTICATED;

    const stored = await this.repo.findRunnerByTokenHashUnscoped(hashAgentRunnerToken(token));
    if (!stored || stored.revokedAt || stored.company.deletingAt) return UNAUTHENTICATED;

    if (stored.createdBy.status !== Status.active) {
      if (stored.createdBy.pausedByPlanAt === null)
        await this.revocation.revoke({ companyId: stored.companyId, runnerId: stored.id, at: this.clock() });
      return UNAUTHENTICATED;
    }

    const runnerLimited = admitAll([[this.limiters.runner, `runner:${stored.id}`]]);
    if (runnerLimited) return { ok: false, reason: "rateLimited", retryAfterSeconds: runnerLimited.retryAfterSeconds };

    return {
      ok: true,
      runner: { id: stored.id, companyId: stored.companyId, name: stored.name, createdById: stored.createdById },
    };
  }
}
