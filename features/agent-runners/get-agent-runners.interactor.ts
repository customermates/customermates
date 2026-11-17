import type { AgentRunnerRepo } from "./agent-runner.repo";
import type { Data, Validated } from "@/core/validation/validation.utils";
import type { FindUserSummariesRepo, UserSummary } from "@/features/user/find-user-summaries.repo";

import { z } from "zod";

import { Resource } from "@/generated/prisma";

import { AllowInDemoMode } from "@/core/decorators/allow-in-demo-mode.decorator";
import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { ValidateOutput } from "@/core/decorators/validate-output.decorator";

import { toAgentRunnerDto } from "./agent-runner-dto";
import { AgentRunnerDtoSchema } from "./agent-runner.schema";

export const ListedAgentRunnerSchema = AgentRunnerDtoSchema.extend({ createdByName: z.string().nullable() });
export type ListedAgentRunner = Data<typeof ListedAgentRunnerSchema>;

export const ListedAgentRunnersSchema = z.object({ runners: z.array(ListedAgentRunnerSchema) });
export type ListedAgentRunners = Data<typeof ListedAgentRunnersSchema>;

function nameOf(user: UserSummary | undefined): string | null {
  return user ? `${user.firstName} ${user.lastName}`.trim() || null : null;
}

@AllowInDemoMode
@TenantInteractor({ resource: Resource.api, read: "all" })
export class GetAgentRunnersInteractor extends AuthenticatedInteractor<void, ListedAgentRunners> {
  constructor(
    private readonly repo: Pick<AgentRunnerRepo, "listRunners">,
    private readonly users: Pick<FindUserSummariesRepo, "findUserSummaries">,
    private readonly clock: () => Date = () => new Date(),
  ) {
    super();
  }

  @ValidateOutput(ListedAgentRunnersSchema)
  async invoke(): Validated<ListedAgentRunners> {
    const now = this.clock();
    const { id: userId, role } = this.user;
    const stored = await this.repo.listRunners();
    const visible = role?.isSystemRole ? stored : stored.filter((runner) => runner.createdById === userId);
    const creators = await this.users.findUserSummaries(visible.map((runner) => runner.createdById));
    const runners = visible.map((runner) => ({
      ...toAgentRunnerDto(runner, now),
      createdByName: nameOf(creators.get(runner.createdById)),
    }));
    return { ok: true, data: { runners } };
  }
}
