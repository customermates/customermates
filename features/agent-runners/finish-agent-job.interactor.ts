import type { Validated } from "@/core/validation/validation.utils";
import type { AgentJobCredentials } from "./agent-job-credentials";
import type { AgentJobRunnerRepo } from "./agent-job-runner.repo";
import type {
  AgentJobFinishResult,
  AgentJobOutcome,
  AgentJobResultBody,
  AgentJobResultRequest,
} from "./agent-runner.schema";

import { SystemInteractor } from "@/core/decorators/system-interactor.decorator";
import { Validate } from "@/core/decorators/validate.decorator";
import { ValidateOutput } from "@/core/decorators/validate-output.decorator";
import * as ErrorReporter from "@/core/observability/server";

import { jobClosed, jobNotFound } from "./agent-runner-failures";
import {
  AGENT_RUNNER_JOB_ERRORS,
  AgentJobFinishResultSchema,
  AgentJobResultRequestSchema,
} from "./agent-runner.schema";

const FINISH_REASONS = { succeeded: "stop", failed: "error", timedOut: "timeLimit" } as const;
const DEFAULT_ERRORS = { failed: AGENT_RUNNER_JOB_ERRORS.failed, timedOut: AGENT_RUNNER_JOB_ERRORS.timedOut } as const;

export function agentRunnerOutcome(data: AgentJobResultBody, toolCalls: number): AgentJobOutcome {
  return {
    status: data.status,
    result: { text: data.summary ?? "", reason: FINISH_REASONS[data.status], toolCalls },
    inputTokens: data.inputTokens ?? null,
    outputTokens: data.outputTokens ?? null,
    error: data.status === "succeeded" ? null : (data.error ?? DEFAULT_ERRORS[data.status]),
  };
}

@SystemInteractor
export class FinishAgentJobInteractor {
  constructor(
    private readonly jobs: Pick<AgentJobRunnerRepo, "findForRunner" | "finish">,
    private readonly credentials: Pick<AgentJobCredentials, "toolCalls" | "revoke">,
  ) {}

  @Validate(AgentJobResultRequestSchema)
  @ValidateOutput(AgentJobFinishResultSchema)
  async invoke(data: AgentJobResultRequest): Validated<AgentJobFinishResult> {
    const { runner } = data.admission;
    const state = await this.jobs.findForRunner(data.jobId, runner);
    if (!state) return jobNotFound();

    const attempt = { companyId: runner.companyId, jobId: state.id, attempt: data.attempt };
    const report = (error: unknown) => {
      ErrorReporter.captureException(error, {
        tags: { kind: "agent-job-credentials-revoke", companyId: runner.companyId },
      });
    };
    const toolCalls = await this.credentials.toolCalls(attempt).catch((error: unknown) => {
      report(error);
      return 0;
    });
    const finished = await this.jobs.finish(state.id, runner, data.attempt, agentRunnerOutcome(data, toolCalls));
    await this.credentials.revoke(attempt).catch(report);
    if (!finished) return jobClosed();
    return { ok: true, data: { ok: true } };
  }
}
