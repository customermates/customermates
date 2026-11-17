import type { Validated } from "@/core/validation/validation.utils";
import type { AgentRunnerRepo } from "./agent-runner.repo";
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
    private readonly repo: Pick<AgentRunnerRepo, "revokeRunner">,
    private readonly clock: () => Date = () => new Date(),
  ) {
    super();
  }

  @Write({ input: RevokeAgentRunnerSchema, output: RevokeAgentRunnerResultSchema, tx: false })
  async invoke(data: RevokeAgentRunnerData): Validated<RevokeAgentRunnerResult> {
    const revokedAt = await this.repo.revokeRunner(data.id, this.clock());
    if (!revokedAt) return failNotFound(CustomErrorCode.agentRunnerNotFound, ["id"]);
    return { ok: true, data: { id: data.id, revokedAt: revokedAt.toISOString() } };
  }
}
