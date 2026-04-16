import { z } from "zod";
import { Action, Resource } from "@/generated/prisma";

import { BaseInteractor } from "@/core/base/base-interactor";
import { TentantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { ValidateOutput } from "@/core/decorators/validate-output.decorator";

export abstract class GetAgentProvisionedRepo {
  abstract getMachineId(): Promise<string | null>;
  abstract verifyProPlanOrThrow(): Promise<void>;
}

@TentantInteractor({ resource: Resource.aiAgent, action: Action.readOwn })
export class GetAgentProvisionedInteractor extends BaseInteractor<void, boolean> {
  constructor(private repo: GetAgentProvisionedRepo) {
    super();
  }

  @ValidateOutput(z.boolean())
  async invoke(): Promise<{ ok: true; data: boolean }> {
    await this.repo.verifyProPlanOrThrow();

    const machineId = await this.repo.getMachineId();

    return { ok: true as const, data: Boolean(machineId) };
  }
}
