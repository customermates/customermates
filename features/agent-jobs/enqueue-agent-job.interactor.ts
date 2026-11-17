import type { InteractorResult } from "@/core/validation/validation.utils";
import type { BackgroundTaskService } from "@/core/utils/background-task.service";
import type { AutomationAgentJobInput, AutomationAgentPort } from "@/features/automation-rules/automation-ports";
import type { AgentRuntimeAvailabilitySource } from "@/features/automation-rules/get-agent-runtime-availability.interactor";
import type { AgentJobRepo } from "./agent-job.repo";
import type { EnqueueAgentJobData, EnqueuedAgentJob } from "./agent-job.schema";

import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { Validate } from "@/core/decorators/validate.decorator";
import { ValidateOutput } from "@/core/decorators/validate-output.decorator";
import { failAuthorization, failUnavailable } from "@/core/validation/interactor-failure-server";
import { CustomErrorCode } from "@/core/validation/validation.types";

import { composeAgentJobPrompt } from "./agent-job-prompt";
import { AGENT_JOB_SOURCE_AUTOMATION, EnqueueAgentJobSchema, EnqueuedAgentJobSchema } from "./agent-job.schema";

const HOSTED_RUNTIMES = new Set<EnqueueAgentJobData["runtime"]>(["mate", "ownKey"]);

type EnqueueRefusal = { ok: false; reason: string };

@TenantInteractor()
export class EnqueueAgentJobInteractor
  extends AuthenticatedInteractor<EnqueueAgentJobData, EnqueuedAgentJob>
  implements AutomationAgentPort
{
  constructor(
    private readonly repo: AgentJobRepo,
    private readonly availability: AgentRuntimeAvailabilitySource,
    private readonly tasks: Pick<BackgroundTaskService, "dispatch">,
  ) {
    super();
  }

  async enqueue(input: AutomationAgentJobInput): Promise<{ ok: true; jobId: string } | EnqueueRefusal> {
    const outcome = await this.invoke(input as EnqueueAgentJobData);
    if (outcome.ok) return { ok: true, jobId: outcome.data.jobId };
    const params = (outcome.error.issues[0] as { params?: Record<string, unknown> } | undefined)?.params;
    return { ok: false, reason: typeof params?.reason === "string" ? params.reason : "agentJobRefused" };
  }

  @Validate(EnqueueAgentJobSchema)
  @ValidateOutput(EnqueuedAgentJobSchema)
  async invoke(data: EnqueueAgentJobData): InteractorResult<EnqueuedAgentJob> {
    if (data.companyId !== this.user.companyId)
      return failAuthorization(CustomErrorCode.agentJobNotFound, ["companyId"], { reason: "agentJobRefused" });
    if (data.ownerUserId !== this.user.id)
      return failAuthorization(CustomErrorCode.agentJobNotFound, ["ownerUserId"], { reason: "agentJobRefused" });

    const refusal = await this.refusal(data);
    if (refusal) return failUnavailable(CustomErrorCode.agentRuntimeUnavailable, ["runtime"], { reason: refusal });

    const job = await this.repo.enqueue({
      runtime: data.runtime,
      sourceKind: AGENT_JOB_SOURCE_AUTOMATION,
      sourceId: data.runId,
      ownerUserId: data.ownerUserId,
      prompt: composeAgentJobPrompt(data.prompt, data.recordRef),
      promptUntrusted: data.promptUntrusted,
      model: data.model,
      runnerId: data.runnerId,
    });
    if (HOSTED_RUNTIMES.has(data.runtime)) {
      await this.tasks.dispatch("run-agent-job", {
        jobId: job.id,
        companyId: job.companyId,
        ownerUserId: job.ownerUserId,
      });
    }
    return { ok: true as const, data: { jobId: job.id } };
  }

  private async refusal(data: EnqueueAgentJobData): Promise<string | null> {
    const option = (await this.availability.availability())[data.runtime];
    if (!option.available) return `agentRuntimeUnavailable:${option.reason ?? "notConfigured"}`;
    if (data.runtime === "ownKey" && data.model && !option.models.some((model) => model.id === data.model))
      return "agentModelUnavailable";
    if (data.runtime === "runner" && data.runnerId && !option.runners.some((runner) => runner.id === data.runnerId))
      return "agentRunnerUnavailable";
    return null;
  }
}
