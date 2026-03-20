import { Action, Resource } from "@/generated/prisma";

import { AgentMachineService } from "./agent-machine.service";

import { AGENT_BASE_URL } from "@/constants/env";
import { TentantInteractor } from "@/core/decorators/tenant-interactor.decorator";

export abstract class GetAgentControlUrlRepo {
  abstract getMachineId(): Promise<string | null>;
  abstract getAgentGatewayToken(): Promise<string | null>;
  abstract clearMachineIds(): Promise<void>;
  abstract verifyProPlanOrThrow(): Promise<void>;
}

@TentantInteractor({ resource: Resource.aiAgent, action: Action.readOwn })
export class GetAgentControlUrlInteractor {
  constructor(
    private repo: GetAgentControlUrlRepo,
    private machineService: AgentMachineService,
  ) {}

  async invoke(): Promise<{ url: string; token: string; machineId: string } | null> {
    await this.repo.verifyProPlanOrThrow();

    const machineId = await this.repo.getMachineId();
    if (!machineId) return null;

    const exists = await this.machineService.machineExists(machineId);
    if (!exists) {
      await this.repo.clearMachineIds();
      return null;
    }

    const token = await this.repo.getAgentGatewayToken();
    if (!token) return null;

    return { url: AGENT_BASE_URL, token, machineId };
  }
}
