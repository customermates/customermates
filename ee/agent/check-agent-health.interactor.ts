import type { AgentMachineService } from "./agent-machine.service";

import { z } from "zod";
import { Action, Resource } from "@/generated/prisma";

import { BaseInteractor } from "@/core/base/base-interactor";
import { TentantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { ValidateOutput } from "@/core/decorators/validate-output.decorator";

export abstract class CheckAgentHealthRepo {
  abstract getMachineIdOrThrow(): Promise<string>;
  abstract getAgentGatewayTokenOrThrow(): Promise<string>;
  abstract verifyProPlanOrThrow(): Promise<void>;
}

@TentantInteractor({ resource: Resource.aiAgent, action: Action.readOwn })
export class CheckAgentHealthInteractor extends BaseInteractor<void, boolean> {
  constructor(
    private repo: CheckAgentHealthRepo,
    private machineService: AgentMachineService,
  ) {
    super();
  }

  @ValidateOutput(z.boolean())
  async invoke(): Promise<{ ok: true; data: boolean }> {
    await this.repo.verifyProPlanOrThrow();
    const machineId = await this.repo.getMachineIdOrThrow();
    const gatewayToken = await this.repo.getAgentGatewayTokenOrThrow();

    const healthy = await this.machineService.checkHealth({ machineId, gatewayToken });
    return { ok: true as const, data: healthy };
  }
}
