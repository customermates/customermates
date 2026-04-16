import type { AgentMachineService } from "./agent-machine.service";

import { z } from "zod";
import { Action, Resource } from "@/generated/prisma";

import { AGENT_BASE_URL } from "@/constants/env";
import { BaseInteractor } from "@/core/base/base-interactor";
import { TentantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { ValidateOutput } from "@/core/decorators/validate-output.decorator";

export abstract class GetAgentControlUrlRepo {
  abstract getMachineId(): Promise<string | null>;
  abstract getAgentGatewayToken(): Promise<string | null>;
  abstract clearMachineIds(): Promise<void>;
  abstract verifyProPlanOrThrow(): Promise<void>;
}

@TentantInteractor({ resource: Resource.aiAgent, action: Action.readOwn })
export class GetAgentControlUrlInteractor extends BaseInteractor<
  void,
  { url: string; token: string; machineId: string } | null
> {
  constructor(
    private repo: GetAgentControlUrlRepo,
    private machineService: AgentMachineService,
  ) {
    super();
  }

  @ValidateOutput(z.object({ url: z.string(), token: z.string(), machineId: z.string() }).nullable())
  async invoke(): Promise<{ ok: true; data: { url: string; token: string; machineId: string } | null }> {
    await this.repo.verifyProPlanOrThrow();

    const machineId = await this.repo.getMachineId();
    if (!machineId) return { ok: true as const, data: null };

    const exists = await this.machineService.machineExists(machineId);
    if (!exists) {
      await this.repo.clearMachineIds();
      return { ok: true as const, data: null };
    }

    const token = await this.repo.getAgentGatewayToken();
    if (!token) return { ok: true as const, data: null };

    return { ok: true as const, data: { url: AGENT_BASE_URL, token, machineId } };
  }
}
