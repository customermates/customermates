import type { Validated } from "@/core/validation/validation.utils";
import type { AgentOwnKeyPlan } from "./agent-own-key-plan";
import type { AgentProviderKeyValidator } from "./agent-provider-key-validator";
import type { AgentProviderKeyRepo } from "./agent-provider-key.repo";
import type { AgentProviderKeyDto, SaveAgentProviderKeyData } from "./agent-provider-key.schema";

import { Resource } from "@/generated/prisma";
import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { Write } from "@/core/decorators/write.decorator";
import { sealSecret, secretLast4 } from "@/core/security/secret-box";
import { fail, failAuthorization, failUnavailable } from "@/core/validation/interactor-failure-server";
import { CustomErrorCode } from "@/core/validation/validation.types";

import { agentProviderKeyBinding } from "./agent-provider-key-binding";
import { toAgentProviderKeyDto } from "./agent-provider-key-dto";
import { AgentProviderKeyDtoSchema, SaveAgentProviderKeySchema } from "./agent-provider-key.schema";
import { isListedAgentProviderModel } from "./agent-provider-models";

@TenantInteractor({ resource: Resource.company, manage: "update" })
export class SaveAgentProviderKeyInteractor extends AuthenticatedInteractor<
  SaveAgentProviderKeyData,
  AgentProviderKeyDto
> {
  constructor(
    private readonly repo: AgentProviderKeyRepo,
    private readonly validator: AgentProviderKeyValidator,
    private readonly plan: AgentOwnKeyPlan,
    private readonly now: () => Date = () => new Date(),
  ) {
    super();
  }

  @Write({ input: SaveAgentProviderKeySchema, output: AgentProviderKeyDtoSchema, tx: false })
  async invoke(data: SaveAgentProviderKeyData): Validated<AgentProviderKeyDto> {
    if (!(await this.plan.allowed())) return failAuthorization(CustomErrorCode.agentOwnKeyPlanRequired);
    if (data.defaultModel && !isListedAgentProviderModel(data.provider, data.defaultModel))
      return fail(CustomErrorCode.agentProviderModelInvalid, ["defaultModel"]);

    const check = await this.validator.check(data.provider, data.apiKey);
    if (check === "invalid") return fail(CustomErrorCode.agentProviderKeyInvalid, ["apiKey"]);
    if (check === "unreachable") return failUnavailable(CustomErrorCode.agentProviderKeyUnreachable, ["apiKey"]);

    const saved = await this.repo.upsert({
      provider: data.provider,
      label: data.label,
      keyCiphertext: sealSecret(data.apiKey, agentProviderKeyBinding(this.user.companyId, data.provider)),
      keyLast4: secretLast4(data.apiKey),
      defaultModel: data.defaultModel ?? null,
      validatedAt: this.now(),
    });
    return { ok: true as const, data: toAgentProviderKeyDto(saved) };
  }
}
