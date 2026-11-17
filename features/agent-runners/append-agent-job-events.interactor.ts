import type { Validated } from "@/core/validation/validation.utils";
import type { AgentJobRunnerRepo } from "./agent-job-runner.repo";
import type { AgentJobEventsRequest, AgentJobEventsResult } from "./agent-runner.schema";

import { SystemInteractor } from "@/core/decorators/system-interactor.decorator";
import { Validate } from "@/core/decorators/validate.decorator";
import { ValidateOutput } from "@/core/decorators/validate-output.decorator";

import { jobClosed, jobNotFound } from "./agent-runner-failures";
import { AgentJobEventsRequestSchema, AgentJobEventsResultSchema } from "./agent-runner.schema";

@SystemInteractor
export class AppendAgentJobEventsInteractor {
  constructor(private readonly jobs: Pick<AgentJobRunnerRepo, "findForRunner" | "appendTranscript">) {}

  @Validate(AgentJobEventsRequestSchema)
  @ValidateOutput(AgentJobEventsResultSchema)
  async invoke(data: AgentJobEventsRequest): Validated<AgentJobEventsResult> {
    const { runner } = data.admission;
    const state = await this.jobs.findForRunner(data.jobId, runner);
    if (!state) return jobNotFound();

    const appended = await this.jobs.appendTranscript(state.id, runner, data.attempt, data.events);
    if (!appended) return jobClosed();
    return { ok: true, data: { ok: true, accepted: data.events.length } };
  }
}
