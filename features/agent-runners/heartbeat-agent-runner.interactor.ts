import type { Validated } from "@/core/validation/validation.utils";
import type { AgentRunnerRepo } from "./agent-runner.repo";
import type { AgentRunnerAuthenticator } from "./agent-runner-authenticator";
import type { AgentRunnerHeartbeatResult, AgentRunnerRequest } from "./agent-runner.schema";

import { SystemInteractor } from "@/core/decorators/system-interactor.decorator";
import { Validate } from "@/core/decorators/validate.decorator";
import { ValidateOutput } from "@/core/decorators/validate-output.decorator";

import { readAgentRunnerBody } from "./agent-runner-request";
import {
  AGENT_RUNNER_LIMITS,
  AgentRunnerHeartbeatBodySchema,
  AgentRunnerHeartbeatResultSchema,
  AgentRunnerRequestSchema,
} from "./agent-runner.schema";

@SystemInteractor
export class HeartbeatAgentRunnerInteractor {
  constructor(
    private readonly authenticator: AgentRunnerAuthenticator,
    private readonly repo: Pick<AgentRunnerRepo, "recordHeartbeatUnscoped">,
    private readonly clock: () => Date = () => new Date(),
  ) {}

  @Validate(AgentRunnerRequestSchema)
  @ValidateOutput(AgentRunnerHeartbeatResultSchema)
  async invoke(data: AgentRunnerRequest): Validated<AgentRunnerHeartbeatResult> {
    const authentication = await this.authenticator.authenticate(data);
    if (!authentication.ok) return authentication.failure;
    const body = await readAgentRunnerBody(data, AgentRunnerHeartbeatBodySchema);
    if (!body.ok) return body;

    const at = this.clock();
    await this.repo.recordHeartbeatUnscoped(authentication.runner.id, {
      machine: body.data.machine,
      clients: body.data.clients,
      at,
    });
    return {
      ok: true,
      data: { ok: true, serverTime: at.toISOString(), onlineWithinSeconds: AGENT_RUNNER_LIMITS.onlineWithinMs / 1000 },
    };
  }
}
