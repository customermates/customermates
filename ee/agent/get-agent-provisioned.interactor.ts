import { Action, Resource } from "@/generated/prisma";

import { TentantInteractor } from "@/core/decorators/tenant-interactor.decorator";

export abstract class GetAgentProvisionedRepo {
  abstract getMachineId(): Promise<string | null>;
  abstract verifyProPlanOrThrow(): Promise<void>;
}

@TentantInteractor({ resource: Resource.aiAgent, action: Action.readOwn })
export class GetAgentProvisionedInteractor {
  constructor(private repo: GetAgentProvisionedRepo) {}

  async invoke(): Promise<boolean> {
    await this.repo.verifyProPlanOrThrow();

    const machineId = await this.repo.getMachineId();

    return Boolean(machineId);
  }
}
