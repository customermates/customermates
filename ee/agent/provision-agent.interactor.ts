import type { AgentMachineService } from "./agent-machine.service";
import type { Data } from "@/core/validation/validation.utils";
import type { AuthService } from "@/features/auth/auth.service";

import { randomBytes } from "crypto";

import { z } from "zod";
import { Action, Resource } from "@/generated/prisma";

import { validateLlmApiKey } from "@/core/validation/validate-llm-api-key";
import { BaseInteractor } from "@/core/base/base-interactor";
import { TentantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { Validate } from "@/core/decorators/validate.decorator";
import { ValidateOutput } from "@/core/decorators/validate-output.decorator";
import { type Validated } from "@/core/validation/validation.utils";

const Schema = z
  .object({
    openaiApiKey: z.string().optional().default(""),
    anthropicApiKey: z.string().optional().default(""),
  })
  .superRefine(async (data, ctx) => await validateLlmApiKey(data, ctx));
export type UpsertAgentKeysData = Data<typeof Schema>;

export abstract class ProvisionAgentRepo {
  abstract getMachineIds(): Promise<{ machineId: string | null; volumeId: string | null }>;
  abstract storeMachineIds(machineId: string, volumeId: string): Promise<void>;
  abstract getCrmApiKeyId(): Promise<string | null>;
  abstract storeCrmApiKey(keyId: string, key: string): Promise<void>;
  abstract storeAgentTokens(gatewayToken: string, hooksToken: string): Promise<void>;
  abstract verifyProPlanOrThrow(): Promise<void>;
}

@TentantInteractor({ resource: Resource.aiAgent, action: Action.create })
export class ProvisionAgentInteractor extends BaseInteractor<UpsertAgentKeysData, UpsertAgentKeysData> {
  constructor(
    private repo: ProvisionAgentRepo,
    private authService: AuthService,
    private machineService: AgentMachineService,
  ) {
    super();
  }

  @Validate(Schema)
  @ValidateOutput(Schema)
  async invoke(data: UpsertAgentKeysData): Validated<UpsertAgentKeysData> {
    await this.repo.verifyProPlanOrThrow();

    const crmApiKey = await this.rotateCrmApiKey();
    const gatewayToken = randomBytes(32).toString("hex");
    const hooksToken = randomBytes(32).toString("hex");
    const { machineId: existingMachineId, volumeId: existingVolumeId } = await this.repo.getMachineIds();

    if (existingMachineId) await this.machineService.destroyMachine(existingMachineId).catch(() => {});
    if (existingVolumeId) await this.machineService.destroyVolume(existingVolumeId).catch(() => {});

    await this.repo.storeAgentTokens(gatewayToken, hooksToken);

    const volumeId = await this.machineService.createVolume();
    const machineId = await this.machineService.createMachine({
      volumeId,
      openaiApiKey: data.openaiApiKey,
      anthropicApiKey: data.anthropicApiKey,
      crmApiKey,
      gatewayToken,
      hooksToken,
    });

    await this.repo.storeMachineIds(machineId, volumeId);

    return { ok: true as const, data };
  }

  private async rotateCrmApiKey() {
    const existingKeyId = await this.repo.getCrmApiKeyId();
    const result = await this.authService.createApiKey({ name: "AI Agent Key" });
    await this.repo.storeCrmApiKey(result.id, result.key);

    if (existingKeyId) await this.authService.deleteApiKey(existingKeyId).catch(() => {});

    return result.key;
  }
}
