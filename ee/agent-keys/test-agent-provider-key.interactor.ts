import type { Validated } from "@/core/validation/validation.utils";
import type { AgentProviderKeyValidator } from "./agent-provider-key-validator";
import type { AgentProviderKeyRepo } from "./agent-provider-key.repo";
import type { AgentProviderKeyDto, TestAgentProviderKeyData } from "./agent-provider-key.schema";

import { Resource } from "@/generated/prisma";
import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { Write } from "@/core/decorators/write.decorator";
import { openSecret } from "@/core/security/secret-box";
import { fail, failNotFound, failUnavailable } from "@/core/validation/interactor-failure-server";
import { CustomErrorCode } from "@/core/validation/validation.types";

import { toAgentProviderKeyDto } from "./agent-provider-key-dto";
import { AgentProviderKeyDtoSchema, TestAgentProviderKeySchema } from "./agent-provider-key.schema";

@TenantInteractor({ resource: Resource.company, manage: "update" })
export class TestAgentProviderKeyInteractor extends AuthenticatedInteractor<
  TestAgentProviderKeyData,
  AgentProviderKeyDto
> {
  constructor(
    private readonly repo: AgentProviderKeyRepo,
    private readonly validator: AgentProviderKeyValidator,
    private readonly now: () => Date = () => new Date(),
  ) {
    super();
  }

  @Write({ input: TestAgentProviderKeySchema, output: AgentProviderKeyDtoSchema, tx: false })
  async invoke({ id }: TestAgentProviderKeyData): Validated<AgentProviderKeyDto> {
    const sealed = await this.repo.findSealed(id);
    if (!sealed) return failNotFound(CustomErrorCode.agentProviderKeyNotFound, ["id"]);

    let apiKey: string;
    try {
      apiKey = openSecret(sealed.keyCiphertext);
    } catch {
      return fail(CustomErrorCode.agentProviderKeyInvalid, ["id"]);
    }

    const check = await this.validator.check(sealed.provider, apiKey);
    if (check === "invalid") return fail(CustomErrorCode.agentProviderKeyInvalid, ["id"]);
    if (check === "unreachable") return failUnavailable(CustomErrorCode.agentProviderKeyUnreachable, ["id"]);

    const validated = await this.repo.markValidated(id, this.now());
    if (!validated) return failNotFound(CustomErrorCode.agentProviderKeyNotFound, ["id"]);
    return { ok: true as const, data: toAgentProviderKeyDto(validated) };
  }
}
