import type { ListMyWorkspacesInteractor } from "@/features/workspace/list-my-workspaces.interactor";
import type { WorkspaceSummary } from "@/features/workspace/workspace.schema";
import type { RouteGuardService } from "./route-guard.service";

import { z } from "zod";
import { Status } from "@/generated/prisma";

import { AllowInDemoMode } from "@/core/decorators/allow-in-demo-mode.decorator";
import { SystemInteractor } from "@/core/decorators/system-interactor.decorator";
import { ValidateOutput } from "@/core/decorators/validate-output.decorator";
import { isSubscriptionExpired } from "@/ee/subscription/entitlements";
import { canConnectMcp } from "./mcp-access";

export const MCP_CONSENT_UNAVAILABLE_REASONS = ["pending", "inactive", "permission", "plan", "terms"] as const;

export const McpConsentWorkspaceSchema = z.object({
  companyId: z.string(),
  name: z.string().nullable(),
  isCurrent: z.boolean(),
  unavailableReason: z.enum(MCP_CONSENT_UNAVAILABLE_REASONS).nullable(),
});
export type McpConsentWorkspace = z.infer<typeof McpConsentWorkspaceSchema>;
type UnavailableReason = (typeof MCP_CONSENT_UNAVAILABLE_REASONS)[number];

@AllowInDemoMode
@SystemInteractor
export class ListMcpConsentWorkspacesInteractor {
  constructor(
    private readonly listMyWorkspaces: Pick<ListMyWorkspacesInteractor, "invoke">,
    private readonly routeGuardService: Pick<RouteGuardService, "resolveMembershipForConsent">,
  ) {}

  @ValidateOutput(McpConsentWorkspaceSchema)
  async invoke(): Promise<{ ok: true; data: McpConsentWorkspace[] }> {
    const { data: workspaces } = await this.listMyWorkspaces.invoke();
    const data = await Promise.all(
      workspaces.map(async (workspace) => ({
        companyId: workspace.companyId,
        name: workspace.name,
        isCurrent: workspace.isCurrent,
        unavailableReason: await this.unavailableReason(workspace),
      })),
    );

    return { ok: true, data };
  }

  private async unavailableReason(workspace: WorkspaceSummary): Promise<UnavailableReason | null> {
    if (workspace.status === Status.pendingAuthorization) return "pending";
    if (workspace.status !== Status.active) return "inactive";

    const membership = await this.routeGuardService.resolveMembershipForConsent(workspace.companyId);
    if (!membership) return workspace.subscription && isSubscriptionExpired(workspace.subscription) ? "plan" : "terms";

    return canConnectMcp(membership.role) ? null : "permission";
  }
}
