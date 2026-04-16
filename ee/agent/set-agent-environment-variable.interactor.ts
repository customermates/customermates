import type { AgentMachineService } from "./agent-machine.service";
import type { Data } from "@/core/validation/validation.utils";

import { z } from "zod";
import { Action, Resource } from "@/generated/prisma";

import { BaseInteractor } from "@/core/base/base-interactor";
import { TentantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { Validate } from "@/core/decorators/validate.decorator";
import { ValidateOutput } from "@/core/decorators/validate-output.decorator";
import { type Validated } from "@/core/validation/validation.utils";

const Schema = z.object({
  key: z
    .string()
    .min(1)
    .max(128)
    .regex(/^[A-Z_][A-Z0-9_]*$/),
  value: z.string().max(8000),
});
export type SetAgentEnvironmentVariableData = Data<typeof Schema>;

export abstract class SetAgentEnvironmentVariableRepo {
  abstract getMachineIdOrThrow(): Promise<string>;
  abstract verifyProPlanOrThrow(): Promise<void>;
}

@TentantInteractor({ resource: Resource.aiAgent, action: Action.update })
export class SetAgentEnvironmentVariableInteractor extends BaseInteractor<
  SetAgentEnvironmentVariableData,
  SetAgentEnvironmentVariableData
> {
  constructor(
    private repo: SetAgentEnvironmentVariableRepo,
    private machineService: AgentMachineService,
  ) {
    super();
  }

  @Validate(Schema)
  @ValidateOutput(Schema)
  async invoke(data: SetAgentEnvironmentVariableData): Validated<SetAgentEnvironmentVariableData> {
    await this.repo.verifyProPlanOrThrow();

    const machineId = await this.repo.getMachineIdOrThrow();

    await this.machineService.setEnvironmentVariable({
      machineId,
      key: data.key,
      value: data.value,
    });

    return { ok: true as const, data };
  }
}
