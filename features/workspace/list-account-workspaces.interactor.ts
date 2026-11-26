import type { Validated } from "@/core/validation/validation.utils";
import type { AuthService } from "@/features/auth/auth.service";
import type { McpWorkspaceAccessService, McpWorkspaceOption } from "@/features/auth/mcp-workspace-access.service";
import type { WorkspacePlanFactsService } from "@/ee/subscription/workspace-plan-facts.service";
import type { PlanUsageRepo } from "@/ee/subscription/plan-usage.repo";

import { z } from "zod";

import { SystemInteractor } from "@/core/decorators/system-interactor.decorator";
import { ValidateOutput } from "@/core/decorators/validate-output.decorator";
import { failAuthorization } from "@/core/validation/interactor-failure-server";
import { CustomErrorCode } from "@/core/validation/validation.types";
import { env } from "@/env";
import { MCP_UNAVAILABLE_REASONS } from "@/features/auth/mcp-access";
import { mcpUnavailableExplanation } from "@/features/auth/mcp-workspace-access.service";

import { WorkspacePlanFactsSchema } from "./workspace-plan-facts.schema";

const AccountWorkspaceSchema = z.object({
  name: z.string().nullable(),
  slug: z.string(),
  companyId: z.string(),
  role: z.string().nullable(),
  isAdmin: z.boolean(),
  setUp: z.boolean().nullable(),
  records: z.number().int().nonnegative().nullable(),
  usable: z.boolean(),
  unavailableReason: z.enum(MCP_UNAVAILABLE_REASONS).nullable(),
  unavailableExplanation: z.string().nullable(),
  plan: WorkspacePlanFactsSchema.nullable(),
});

const OutputSchema = z.object({
  workspaces: z.array(AccountWorkspaceSchema),
  canCreateWorkspace: z.boolean(),
});
export type AccountWorkspaces = z.infer<typeof OutputSchema>;

@SystemInteractor
export class ListAccountWorkspacesInteractor {
  constructor(
    private readonly authService: Pick<AuthService, "getMcpCredential">,
    private readonly access: Pick<McpWorkspaceAccessService, "listWorkspaces">,
    private readonly planFacts: Pick<WorkspacePlanFactsService, "factsFor">,
    private readonly usage: Pick<PlanUsageRepo, "countRecordsUnscoped">,
  ) {}

  @ValidateOutput(OutputSchema)
  async invoke(): Validated<AccountWorkspaces> {
    const credential = await this.authService.getMcpCredential();
    if (!credential) return failAuthorization(CustomErrorCode.notAuthenticated);

    const options = await this.access.listWorkspaces(credential.email);
    const visible =
      credential.credential === "apiKey"
        ? options.filter((option) => option.companyId === credential.companyId)
        : options;

    return {
      ok: true,
      data: {
        workspaces: await Promise.all(visible.map((option) => this.describe(option))),
        canCreateWorkspace: env.APP_MODE === "cloud" && credential.credential === "bearer",
      },
    };
  }

  private async describe(option: McpWorkspaceOption) {
    const usable = option.unavailableReason === null;
    const [records, plan] = usable
      ? await Promise.all([this.usage.countRecordsUnscoped(option.companyId), this.planFacts.factsFor(option)])
      : [null, null];

    return {
      name: option.name,
      slug: option.slug,
      companyId: option.companyId,
      role: option.roleName,
      isAdmin: option.isAdmin,
      setUp: records === null ? null : records > 0,
      records,
      usable,
      unavailableReason: option.unavailableReason,
      unavailableExplanation: option.unavailableReason ? mcpUnavailableExplanation(option.unavailableReason) : null,
      plan,
    };
  }
}
