import type { AgentRunnerRepo } from "./agent-runner.repo";
import type { GetAgentRunnersResult } from "./agent-runner.schema";
import type { Validated } from "@/core/validation/validation.utils";

import { Resource } from "@/generated/prisma";

import { AllowInDemoMode } from "@/core/decorators/allow-in-demo-mode.decorator";
import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { ValidateOutput } from "@/core/decorators/validate-output.decorator";

import { toAgentRunnerDto } from "./agent-runner-dto";
import { GetAgentRunnersResultSchema } from "./agent-runner.schema";

@AllowInDemoMode
@TenantInteractor({ resource: Resource.api, read: "all" })
export class GetAgentRunnersInteractor extends AuthenticatedInteractor<void, GetAgentRunnersResult> {
  constructor(
    private readonly repo: Pick<AgentRunnerRepo, "listRunners">,
    private readonly clock: () => Date = () => new Date(),
  ) {
    super();
  }

  @ValidateOutput(GetAgentRunnersResultSchema)
  async invoke(): Validated<GetAgentRunnersResult> {
    const now = this.clock();
    const runners = await this.repo.listRunners();
    return { ok: true, data: { runners: runners.map((runner) => toAgentRunnerDto(runner, now)) } };
  }
}
