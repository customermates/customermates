import type { Validated } from "@/core/validation/validation.utils";
import type { AgentJobRunnerRepo } from "./agent-job-runner.repo";
import type { AgentRunnerAuthenticator } from "./agent-runner-authenticator";
import type { AgentJobStartResult, AgentRunnerJobRequest } from "./agent-runner.schema";

import { SystemInteractor } from "@/core/decorators/system-interactor.decorator";
import { Validate } from "@/core/decorators/validate.decorator";
import { ValidateOutput } from "@/core/decorators/validate-output.decorator";

import { jobClosed, jobNotFound } from "./agent-runner-failures";
import { readAgentRunnerBody } from "./agent-runner-request";
import { AgentJobStartBodySchema, AgentJobStartResultSchema, AgentRunnerJobRequestSchema } from "./agent-runner.schema";

@SystemInteractor
export class StartAgentJobInteractor {
  constructor(
    private readonly authenticator: AgentRunnerAuthenticator,
    private readonly jobs: Pick<AgentJobRunnerRepo, "findForRunner" | "start">,
    private readonly clock: () => Date = () => new Date(),
  ) {}

  @Validate(AgentRunnerJobRequestSchema)
  @ValidateOutput(AgentJobStartResultSchema)
  async invoke(data: AgentRunnerJobRequest): Validated<AgentJobStartResult> {
    const authentication = await this.authenticator.authenticate(data);
    if (!authentication.ok) return authentication.failure;
    const body = await readAgentRunnerBody(data, AgentJobStartBodySchema);
    if (!body.ok) return body;

    const { runner } = authentication;
    const { attempt } = body.data;
    const state = await this.jobs.findForRunner(data.jobId, runner);
    if (!state) return jobNotFound();

    const alreadyRunning = state.status === "running" && state.attempt === attempt ? state.timeoutAt : null;
    const timeoutAt = alreadyRunning ?? (await this.jobs.start(state.id, runner, attempt));
    if (!timeoutAt) return jobClosed();

    const remainingMs = timeoutAt.getTime() - this.clock().getTime();
    return { ok: true, data: { ok: true, timeoutInSeconds: Math.max(0, Math.floor(remainingMs / 1000)) } };
  }
}
