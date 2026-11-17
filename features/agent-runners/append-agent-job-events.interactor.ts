import type { Validated } from "@/core/validation/validation.utils";
import type { AgentJobRunnerRepo } from "./agent-job-runner.repo";
import type { AgentRunnerAuthenticator } from "./agent-runner-authenticator";
import type { AgentJobEventsResult, AgentRunnerJobRequest } from "./agent-runner.schema";

import { SystemInteractor } from "@/core/decorators/system-interactor.decorator";
import { Validate } from "@/core/decorators/validate.decorator";
import { ValidateOutput } from "@/core/decorators/validate-output.decorator";

import { jobClosed, jobNotFound } from "./agent-runner-failures";
import { readAgentRunnerBody } from "./agent-runner-request";
import {
  AgentJobEventsBodySchema,
  AgentJobEventsResultSchema,
  AgentRunnerJobRequestSchema,
} from "./agent-runner.schema";

@SystemInteractor
export class AppendAgentJobEventsInteractor {
  constructor(
    private readonly authenticator: AgentRunnerAuthenticator,
    private readonly jobs: Pick<AgentJobRunnerRepo, "findForRunner" | "appendTranscript">,
  ) {}

  @Validate(AgentRunnerJobRequestSchema)
  @ValidateOutput(AgentJobEventsResultSchema)
  async invoke(data: AgentRunnerJobRequest): Validated<AgentJobEventsResult> {
    const authentication = await this.authenticator.authenticate(data);
    if (!authentication.ok) return authentication.failure;
    const body = await readAgentRunnerBody(data, AgentJobEventsBodySchema);
    if (!body.ok) return body;

    const { runner } = authentication;
    const state = await this.jobs.findForRunner(data.jobId, runner);
    if (!state) return jobNotFound();

    const appended = await this.jobs.appendTranscript(state.id, runner, body.data.attempt, body.data.events);
    if (!appended) return jobClosed();
    return { ok: true, data: { ok: true, accepted: body.data.events.length } };
  }
}
