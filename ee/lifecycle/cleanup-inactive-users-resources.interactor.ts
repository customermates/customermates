import { User } from "@/generated/prisma";

import { SystemInteractor } from "@/core/decorators/system-interactor.decorator";
import { AgentMachineService } from "@/ee/agent/agent-machine.service";

export abstract class CleanupInactiveUsersResourcesActionRepo {
  abstract findInactiveUsersPast3DaysForCleanup(): Promise<User[]>;
  abstract clearMachineIdsForUser(userId: string): Promise<void>;
}

@SystemInteractor
export class CleanupInactiveUsersResourcesInteractor {
  constructor(
    private repo: CleanupInactiveUsersResourcesActionRepo,
    private machineService: AgentMachineService,
  ) {}

  async invoke(): Promise<void> {
    const users = await this.repo.findInactiveUsersPast3DaysForCleanup();

    for (const user of users) {
      if (user.flyMachineId) await this.machineService.destroyMachine(user.flyMachineId);
      if (user.flyVolumeId) await this.machineService.destroyVolume(user.flyVolumeId);
      await this.repo.clearMachineIdsForUser(user.id);
    }
  }
}
