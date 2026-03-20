import { Action, Resource } from "@/generated/prisma";

import { AgentMachineService } from "./agent-machine.service";

import { TentantInteractor } from "@/core/decorators/tenant-interactor.decorator";

export abstract class ResetAgentRepo {
  abstract getMachineIdsOrThrow(): Promise<{ machineId: string; volumeId: string }>;
  abstract clearMachineIds(): Promise<void>;
  abstract verifyProPlanOrThrow(): Promise<void>;
}

@TentantInteractor({ resource: Resource.aiAgent, action: Action.delete })
export class ResetAgentInteractor {
  constructor(
    private repo: ResetAgentRepo,
    private machineService: AgentMachineService,
  ) {}

  async invoke(): Promise<void> {
    await this.repo.verifyProPlanOrThrow();

    const { machineId, volumeId } = await this.repo.getMachineIdsOrThrow();

    await this.machineService.destroyMachine(machineId).catch(() => {});
    await this.machineService.destroyVolume(volumeId).catch(() => {});

    await this.repo.clearMachineIds();
  }
}
