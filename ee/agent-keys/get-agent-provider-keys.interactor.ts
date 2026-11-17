import type { Validated } from "@/core/validation/validation.utils";
import type { AgentProviderKeyRepo } from "./agent-provider-key.repo";
import type { AgentProviderKeyList } from "./agent-provider-key.schema";

import { z } from "zod";

import { Resource } from "@/generated/prisma";
import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { AllowInDemoMode } from "@/core/decorators/allow-in-demo-mode.decorator";
import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { Validate } from "@/core/decorators/validate.decorator";
import { ValidateOutput } from "@/core/decorators/validate-output.decorator";

import { toAgentProviderKeyDto } from "./agent-provider-key-dto";
import { AgentProviderKeyListSchema } from "./agent-provider-key.schema";

const NoInputSchema = z.object({}).strict();

@AllowInDemoMode
@TenantInteractor({ resource: Resource.company, read: true })
export class GetAgentProviderKeysInteractor extends AuthenticatedInteractor<
  z.infer<typeof NoInputSchema>,
  AgentProviderKeyList
> {
  constructor(private readonly repo: AgentProviderKeyRepo) {
    super();
  }

  @Validate(NoInputSchema)
  @ValidateOutput(AgentProviderKeyListSchema)
  async invoke(): Validated<AgentProviderKeyList> {
    const rows = await this.repo.findAll();
    return { ok: true as const, data: { keys: rows.map(toAgentProviderKeyDto) } };
  }
}
