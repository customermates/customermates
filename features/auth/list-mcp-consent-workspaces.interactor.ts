import type { ListMyWorkspacesInteractor } from "@/features/workspace/list-my-workspaces.interactor";
import type { WorkspaceMembershipRepo } from "@/features/workspace/workspace-membership.repo";
import type { AuthService } from "./auth.service";
import type { RouteGuardService } from "./route-guard.service";

import { z } from "zod";

import { CONTRACT_LEGAL_DOCUMENTS, hasCurrentLegalDocumentVersions } from "@/constants/legal-documents";
import { AllowInDemoMode } from "@/core/decorators/allow-in-demo-mode.decorator";
import { SystemInteractor } from "@/core/decorators/system-interactor.decorator";
import { ValidateOutput } from "@/core/decorators/validate-output.decorator";
import { env } from "@/env";
import { WORKSPACE_INACTIVE_REASONS } from "@/features/workspace/workspace.schema";
import { MCP_UNAVAILABLE_REASONS, mcpUnavailableReason } from "./mcp-access";

export const McpConsentWorkspaceSchema = z.object({
  companyId: z.string(),
  name: z.string().nullable(),
  roleName: z.string().nullable(),
  isCurrent: z.boolean(),
  unavailableReason: z.enum(MCP_UNAVAILABLE_REASONS).nullable(),
  inactiveReason: z.enum(WORKSPACE_INACTIVE_REASONS).nullable(),
});
export type McpConsentWorkspace = z.infer<typeof McpConsentWorkspaceSchema>;

const OutputSchema = z.object({
  workspaces: z.array(McpConsentWorkspaceSchema),
  termsOffered: z.boolean(),
  termsRequired: z.boolean(),
});
export type McpConsentAccount = z.infer<typeof OutputSchema>;

@AllowInDemoMode
@SystemInteractor
export class ListMcpConsentWorkspacesInteractor {
  constructor(
    private readonly authService: Pick<AuthService, "getInteractiveSession">,
    private readonly listMyWorkspaces: Pick<ListMyWorkspacesInteractor, "invoke">,
    private readonly routeGuardService: Pick<RouteGuardService, "resolveMembershipForConsent">,
    private readonly legal: Pick<WorkspaceMembershipRepo, "findAccountLegalVersionsUnscoped">,
  ) {}

  @ValidateOutput(OutputSchema)
  async invoke(): Promise<{ ok: true; data: McpConsentAccount }> {
    const { data: rows } = await this.listMyWorkspaces.invoke();
    const workspaces = await Promise.all(
      rows.map(async (workspace) => ({
        companyId: workspace.companyId,
        name: workspace.name,
        roleName: workspace.roleName,
        isCurrent: workspace.isCurrent,
        unavailableReason: await mcpUnavailableReason(workspace, (companyId) =>
          this.routeGuardService.resolveMembershipForConsent(companyId),
        ),
        inactiveReason: workspace.inactiveReason,
      })),
    );

    const termsOffered = await this.termsOffered();
    return { ok: true, data: { workspaces, termsOffered, termsRequired: termsOffered && workspaces.length === 0 } };
  }

  private async termsOffered(): Promise<boolean> {
    if (env.APP_MODE !== "cloud") return false;
    const session = await this.authService.getInteractiveSession();
    if (!session) return false;

    const accepted = await this.legal.findAccountLegalVersionsUnscoped(session.user.id);
    return !hasCurrentLegalDocumentVersions(accepted, CONTRACT_LEGAL_DOCUMENTS);
  }
}
