import type { WorkspacePlanService } from "@/ee/subscription/workspace-plan.service";
import type { Validated } from "@/core/validation/validation.utils";
import type { AgentRunnerRepo } from "./agent-runner.repo";
import type { CreateAgentRunnerData, CreateAgentRunnerResult } from "./agent-runner.schema";

import { Resource } from "@/generated/prisma";

import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { Write } from "@/core/decorators/write.decorator";
import { failAuthorization } from "@/core/validation/interactor-failure-server";
import { CustomErrorCode } from "@/core/validation/validation.types";

import { toAgentRunnerDto } from "./agent-runner-dto";
import { generateAgentRunnerToken, hashAgentRunnerToken } from "./agent-runner-token";
import { CreateAgentRunnerResultSchema, CreateAgentRunnerSchema } from "./agent-runner.schema";

@TenantInteractor({ resource: Resource.api, manage: "create" })
export class CreateAgentRunnerInteractor extends AuthenticatedInteractor<
  CreateAgentRunnerData,
  CreateAgentRunnerResult
> {
  constructor(
    private readonly repo: Pick<AgentRunnerRepo, "createRunner">,
    private readonly plans: Pick<WorkspacePlanService, "canCreateIntegrations">,
    private readonly settings: { baseUrl: string },
    private readonly clock: () => Date = () => new Date(),
  ) {
    super();
  }

  @Write({ input: CreateAgentRunnerSchema, output: CreateAgentRunnerResultSchema, tx: false })
  async invoke(data: CreateAgentRunnerData): Validated<CreateAgentRunnerResult> {
    if (!(await this.plans.canCreateIntegrations(this.companyId)))
      return failAuthorization(CustomErrorCode.workspacePlanRequired);

    const token = generateAgentRunnerToken();
    const stored = await this.repo.createRunner({ name: data.name.trim(), tokenHash: hashAgentRunnerToken(token) });
    return {
      ok: true,
      data: { runner: toAgentRunnerDto(stored, this.clock()), token, url: this.settings.baseUrl.replace(/\/$/u, "") },
    };
  }
}
