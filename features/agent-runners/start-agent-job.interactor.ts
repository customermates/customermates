import type { Validated } from "@/core/validation/validation.utils";
import type { AgentJobRunnerRepo } from "./agent-job-runner.repo";
import type { AgentJobStartRequest, AgentJobStartResult } from "./agent-runner.schema";

import { SystemInteractor } from "@/core/decorators/system-interactor.decorator";
import { Validate } from "@/core/decorators/validate.decorator";
import { ValidateOutput } from "@/core/decorators/validate-output.decorator";

import { jobClosed, jobNotFound } from "./agent-runner-failures";
import { AgentJobStartRequestSchema, AgentJobStartResultSchema } from "./agent-runner.schema";

@SystemInteractor
export class StartAgentJobInteractor {
  constructor(
    private readonly jobs: Pick<AgentJobRunnerRepo, "findForRunner" | "start">,
    private readonly clock: () => Date = () => new Date(),
  ) {}

  @Validate(AgentJobStartRequestSchema)
  @ValidateOutput(AgentJobStartResultSchema)
  async invoke(data: AgentJobStartRequest): Validated<AgentJobStartResult> {
    const { runner } = data.admission;
    const state = await this.jobs.findForRunner(data.jobId, runner);
    if (!state) return jobNotFound();

    const alreadyRunning = state.status === "running" && state.attempt === data.attempt ? state.timeoutAt : null;
    const timeoutAt = alreadyRunning ?? (await this.jobs.start(state.id, runner, data.attempt));
    if (!timeoutAt) return jobClosed();

    const remainingMs = timeoutAt.getTime() - this.clock().getTime();
    return { ok: true, data: { ok: true, timeoutInSeconds: Math.max(0, Math.floor(remainingMs / 1000)) } };
  }
}
