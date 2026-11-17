import type { Validated } from "@/core/validation/validation.utils";
import type { AgentProviderKeyRepo } from "./agent-provider-key.repo";
import type { DeleteAgentProviderKeyData, DeleteAgentProviderKeyResult } from "./agent-provider-key.schema";

import { Resource } from "@/generated/prisma";
import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { Write } from "@/core/decorators/write.decorator";
import { failNotFound } from "@/core/validation/interactor-failure-server";
import { CustomErrorCode } from "@/core/validation/validation.types";

import { DeleteAgentProviderKeyResultSchema, DeleteAgentProviderKeySchema } from "./agent-provider-key.schema";

@TenantInteractor({ resource: Resource.company, manage: "update" })
export class DeleteAgentProviderKeyInteractor extends AuthenticatedInteractor<
  DeleteAgentProviderKeyData,
  DeleteAgentProviderKeyResult
> {
  constructor(private readonly repo: AgentProviderKeyRepo) {
    super();
  }

  @Write({ input: DeleteAgentProviderKeySchema, output: DeleteAgentProviderKeyResultSchema })
  async invoke({ id }: DeleteAgentProviderKeyData): Validated<DeleteAgentProviderKeyResult> {
    if (!(await this.repo.delete(id))) return failNotFound(CustomErrorCode.agentProviderKeyNotFound, ["id"]);
    return { ok: true as const, data: { id } };
  }
}
