import type { Validated } from "@/core/validation/validation.utils";
import type { AgentRunnerRepo } from "./agent-runner.repo";
import type { AgentRunnerHeartbeatRequest, AgentRunnerHeartbeatResult } from "./agent-runner.schema";

import { SystemInteractor } from "@/core/decorators/system-interactor.decorator";
import { Validate } from "@/core/decorators/validate.decorator";
import { ValidateOutput } from "@/core/decorators/validate-output.decorator";

import {
  AGENT_RUNNER_LIMITS,
  AgentRunnerHeartbeatRequestSchema,
  AgentRunnerHeartbeatResultSchema,
} from "./agent-runner.schema";

@SystemInteractor
export class HeartbeatAgentRunnerInteractor {
  constructor(
    private readonly repo: Pick<AgentRunnerRepo, "recordHeartbeatUnscoped">,
    private readonly clock: () => Date = () => new Date(),
  ) {}

  @Validate(AgentRunnerHeartbeatRequestSchema)
  @ValidateOutput(AgentRunnerHeartbeatResultSchema)
  async invoke(data: AgentRunnerHeartbeatRequest): Validated<AgentRunnerHeartbeatResult> {
    const at = this.clock();
    await this.repo.recordHeartbeatUnscoped(data.admission.runner.id, {
      machine: data.machine,
      clients: data.clients,
      at,
    });
    return {
      ok: true,
      data: { ok: true, serverTime: at.toISOString(), onlineWithinSeconds: AGENT_RUNNER_LIMITS.onlineWithinMs / 1000 },
    };
  }
}
