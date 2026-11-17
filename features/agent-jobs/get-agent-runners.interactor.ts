import type { Validated } from "@/core/validation/validation.utils";
import type { AgentRunnerPresenceRepo } from "./agent-runner-presence.repo";
import type { AgentRunnerList } from "./agent-runner.schema";

import { z } from "zod";

import { Resource } from "@/generated/prisma";
import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { AllowInDemoMode } from "@/core/decorators/allow-in-demo-mode.decorator";
import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { Validate } from "@/core/decorators/validate.decorator";
import { ValidateOutput } from "@/core/decorators/validate-output.decorator";

import { AgentRunnerListSchema, isAgentRunnerOnline } from "./agent-runner.schema";

const NoInputSchema = z.object({}).strict();

@AllowInDemoMode
@TenantInteractor({ resource: Resource.company, read: true })
export class GetAgentRunnersInteractor extends AuthenticatedInteractor<z.infer<typeof NoInputSchema>, AgentRunnerList> {
  constructor(
    private readonly repo: AgentRunnerPresenceRepo,
    private readonly clock: () => Date = () => new Date(),
  ) {
    super();
  }

  @Validate(NoInputSchema)
  @ValidateOutput(AgentRunnerListSchema)
  async invoke(): Validated<AgentRunnerList> {
    const now = this.clock();
    const runners = await this.repo.findActive();
    return {
      ok: true as const,
      data: {
        runners: runners.map((runner) => ({
          id: runner.id,
          name: runner.name,
          machine: runner.machine,
          lastSeenAt: runner.lastSeenAt?.toISOString() ?? null,
          online: isAgentRunnerOnline(runner.lastSeenAt, now),
        })),
      },
    };
  }
}
