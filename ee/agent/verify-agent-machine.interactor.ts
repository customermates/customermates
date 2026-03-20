import { Action, Resource } from "@/generated/prisma";

import { AgentMachineService } from "./agent-machine.service";

import { TentantInteractor } from "@/core/decorators/tenant-interactor.decorator";

export abstract class VerifyAgentMachineRepo {
  abstract getMachineId(): Promise<string | null>;
  abstract clearMachineIds(): Promise<void>;
  abstract verifyProPlanOrThrow(): Promise<void>;
}

@TentantInteractor({ resource: Resource.aiAgent, action: Action.readOwn })
export class VerifyAgentMachineInteractor {
  constructor(
    private repo: VerifyAgentMachineRepo,
    private machineService: AgentMachineService,
  ) {}

  async invoke(): Promise<boolean> {
    await this.repo.verifyProPlanOrThrow();

    const machineId = await this.repo.getMachineId();
    if (!machineId) return false;

    const exists = await this.machineService.machineExists(machineId);
    if (!exists) await this.repo.clearMachineIds();

    return exists;
  }
}
