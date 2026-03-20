import { User } from "@/generated/prisma";

import { SystemInteractor } from "@/core/decorators/system-interactor.decorator";
import { AgentMachineService } from "@/ee/agent/agent-machine.service";

export abstract class CleanupNonProCompaniesResourcesRepo {
  abstract findUsersWithResourcesOutsideProPlan(): Promise<User[]>;
  abstract clearMachineIdsForUser(userId: string): Promise<void>;
}

@SystemInteractor
export class CleanupNonProCompaniesResourcesInteractor {
  constructor(
    private repo: CleanupNonProCompaniesResourcesRepo,
    private machineService: AgentMachineService,
  ) {}

  async invoke(): Promise<void> {
    const users = await this.repo.findUsersWithResourcesOutsideProPlan();

    for (const user of users) {
      if (user.flyMachineId) await this.machineService.destroyMachine(user.flyMachineId).catch(() => {});
      if (user.flyVolumeId) await this.machineService.destroyVolume(user.flyVolumeId).catch(() => {});
      await this.repo.clearMachineIdsForUser(user.id);
    }
  }
}
