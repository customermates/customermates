import type { Validated } from "@/core/validation/validation.utils";
import type { AgentJobRepo } from "./agent-job.repo";
import type { AgentJobDetail, GetAgentJobData } from "./agent-job.schema";

import { Resource } from "@/generated/prisma";
import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { roleReadScope } from "@/core/base/permission.service";
import { AllowInDemoMode } from "@/core/decorators/allow-in-demo-mode.decorator";
import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { Validate } from "@/core/decorators/validate.decorator";
import { ValidateOutput } from "@/core/decorators/validate-output.decorator";
import { failNotFound } from "@/core/validation/interactor-failure-server";
import { CustomErrorCode } from "@/core/validation/validation.types";

import { toAgentJobDetail } from "./agent-job-dto";
import { AgentJobDetailSchema, GetAgentJobSchema } from "./agent-job.schema";

@AllowInDemoMode
@TenantInteractor({ resource: Resource.routines, read: true })
export class GetAgentJobInteractor extends AuthenticatedInteractor<GetAgentJobData, AgentJobDetail> {
  constructor(private readonly repo: AgentJobRepo) {
    super();
  }

  @Validate(GetAgentJobSchema)
  @ValidateOutput(AgentJobDetailSchema)
  async invoke({ id }: GetAgentJobData): Validated<AgentJobDetail> {
    const job = await this.repo.findOne(id);
    const visible =
      job && (roleReadScope(this.user.role, Resource.routines) === "all" || job.ownerUserId === this.user.id);
    if (!job || !visible) return failNotFound(CustomErrorCode.agentJobNotFound, ["id"]);
    return { ok: true as const, data: toAgentJobDetail(job) };
  }
}
