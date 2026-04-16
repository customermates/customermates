import type { AgentMachineService } from "./agent-machine.service";

import { z } from "zod";
import { Action, Resource } from "@/generated/prisma";

import { BaseInteractor } from "@/core/base/base-interactor";
import { TentantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { ValidateOutput } from "@/core/decorators/validate-output.decorator";

export abstract class VerifyAgentMachineRepo {
  abstract getMachineId(): Promise<string | null>;
  abstract clearMachineIds(): Promise<void>;
  abstract verifyProPlanOrThrow(): Promise<void>;
}

@TentantInteractor({ resource: Resource.aiAgent, action: Action.readOwn })
export class VerifyAgentMachineInteractor extends BaseInteractor<void, boolean> {
  constructor(
    private repo: VerifyAgentMachineRepo,
    private machineService: AgentMachineService,
  ) {
    super();
  }

  @ValidateOutput(z.boolean())
  async invoke(): Promise<{ ok: true; data: boolean }> {
    await this.repo.verifyProPlanOrThrow();

    const machineId = await this.repo.getMachineId();
    if (!machineId) return { ok: true as const, data: false };

    const exists = await this.machineService.machineExists(machineId);
    if (!exists) await this.repo.clearMachineIds();

    return { ok: true as const, data: exists };
  }
}
