import type { TokenBucketRateLimiter } from "@/core/network/token-bucket-rate-limiter";
import type { InteractorFailure } from "@/core/validation/validation.utils";
import type { AgentRunnerRepo } from "./agent-runner.repo";
import type { AgentRunnerRevocation } from "./agent-runner-revocation";
import type { AuthenticatedAgentRunner } from "./agent-runner.schema";

import { Status } from "@/generated/prisma";

import { admitAll } from "@/core/network/public-access";
import { fail, failRateLimit } from "@/core/validation/interactor-failure-server";
import { CustomErrorCode } from "@/core/validation/validation.types";

import { agentRunnerTokenFromHeader, hashAgentRunnerToken } from "./agent-runner-token";

export type AgentRunnerCredentials = { authorization: string | null; visitor?: string | null };

export type AgentRunnerLimiters = { runner: TokenBucketRateLimiter; visitor: TokenBucketRateLimiter };

export type AgentRunnerAuthentication =
  | { ok: true; runner: AuthenticatedAgentRunner }
  | { ok: false; failure: InteractorFailure };

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
    if (visitorLimited) return { ok: false, failure: await failRateLimit(CustomErrorCode.apiRateLimitReached) };

    const token = agentRunnerTokenFromHeader(credentials.authorization);
    if (!token) return { ok: false, failure: await fail(CustomErrorCode.notAuthenticated) };

    const stored = await this.repo.findRunnerByTokenHashUnscoped(hashAgentRunnerToken(token));
    if (!stored || stored.revokedAt || stored.company.deletingAt)
      return { ok: false, failure: await fail(CustomErrorCode.notAuthenticated) };

    if (stored.createdBy.status !== Status.active) {
      await this.revocation.revoke({ companyId: stored.companyId, runnerId: stored.id, at: this.clock() });
      return { ok: false, failure: await fail(CustomErrorCode.notAuthenticated) };
    }

    const runnerLimited = admitAll([[this.limiters.runner, `runner:${stored.id}`]]);
    if (runnerLimited) return { ok: false, failure: await failRateLimit(CustomErrorCode.apiRateLimitReached) };

    return {
      ok: true,
      runner: { id: stored.id, companyId: stored.companyId, name: stored.name, createdById: stored.createdById },
    };
  }
}
