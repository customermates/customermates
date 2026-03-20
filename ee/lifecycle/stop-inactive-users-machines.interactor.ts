import { User } from "@/generated/prisma";

import { SystemInteractor } from "@/core/decorators/system-interactor.decorator";
import { AgentMachineService } from "@/ee/agent/agent-machine.service";

export abstract class StopInactiveUsersMachinesRepo {
  abstract findActiveUsersInactiveFor24HoursWithMachine(): Promise<User[]>;
}

@SystemInteractor
export class StopInactiveUsersMachinesInteractor {
  constructor(
    private repo: StopInactiveUsersMachinesRepo,
    private machineService: AgentMachineService,
  ) {}

  async invoke(): Promise<void> {
    const users = await this.repo.findActiveUsersInactiveFor24HoursWithMachine();

    for (const user of users)
      if (user.flyMachineId) await this.machineService.stopMachine(user.flyMachineId).catch(() => {});
  }
}
