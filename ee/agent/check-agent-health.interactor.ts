import { Action, Resource } from "@/generated/prisma";

import { AgentMachineService } from "./agent-machine.service";

import { TentantInteractor } from "@/core/decorators/tenant-interactor.decorator";

export abstract class CheckAgentHealthRepo {
  abstract getMachineIdOrThrow(): Promise<string>;
  abstract getAgentGatewayTokenOrThrow(): Promise<string>;
  abstract verifyProPlanOrThrow(): Promise<void>;
}

@TentantInteractor({ resource: Resource.aiAgent, action: Action.readOwn })
export class CheckAgentHealthInteractor {
  constructor(
    private repo: CheckAgentHealthRepo,
    private machineService: AgentMachineService,
  ) {}

  async invoke(): Promise<boolean> {
    await this.repo.verifyProPlanOrThrow();
    const machineId = await this.repo.getMachineIdOrThrow();
    const gatewayToken = await this.repo.getAgentGatewayTokenOrThrow();

    return this.machineService.checkHealth({ machineId, gatewayToken });
  }
}
