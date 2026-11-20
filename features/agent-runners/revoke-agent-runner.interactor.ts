import type { Validated } from "@/core/validation/validation.utils";
import type { AgentRunnerRepo } from "./agent-runner.repo";
import type { AgentRunnerRevocation } from "./agent-runner-revocation";
import type { RevokeAgentRunnerData, RevokeAgentRunnerResult } from "./agent-runner.schema";

import { Resource } from "@/generated/prisma";

import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { Write } from "@/core/decorators/write.decorator";
import { failNotFound } from "@/core/validation/interactor-failure-server";
import { CustomErrorCode } from "@/core/validation/validation.types";

import { RevokeAgentRunnerResultSchema, RevokeAgentRunnerSchema } from "./agent-runner.schema";

@TenantInteractor({ resource: Resource.api, manage: "delete" })
export class RevokeAgentRunnerInteractor extends AuthenticatedInteractor<
  RevokeAgentRunnerData,
  RevokeAgentRunnerResult
> {
  constructor(
    private readonly repo: Pick<AgentRunnerRepo, "findRunner">,
    private readonly revocation: Pick<AgentRunnerRevocation, "revoke">,
    private readonly clock: () => Date = () => new Date(),
  ) {
    super();
  }

  @Write({ input: RevokeAgentRunnerSchema, output: RevokeAgentRunnerResultSchema, tx: false })
  async invoke(data: RevokeAgentRunnerData): Validated<RevokeAgentRunnerResult> {
    const runner = await this.repo.findRunner(data.id);
    if (!runner) return failNotFound(CustomErrorCode.agentRunnerNotFound, ["id"]);
    if (runner.createdById !== this.user.id && !this.user.role?.isSystemRole)
      return failNotFound(CustomErrorCode.agentRunnerNotFound, ["id"]);
    if (runner.revokedAt) return { ok: true, data: { id: data.id, revokedAt: runner.revokedAt.toISOString() } };

    const at = this.clock();
    await this.revocation.revoke({ companyId: this.companyId, runnerId: runner.id, at });
    return { ok: true, data: { id: data.id, revokedAt: at.toISOString() } };
  }
}
