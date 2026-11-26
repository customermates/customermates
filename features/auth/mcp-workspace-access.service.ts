import type { RouteGuardService } from "./route-guard.service";
import type { WorkspaceMembershipRepo, WorkspaceMembershipRow } from "@/features/workspace/workspace-membership.repo";
import type { WorkspaceSlugResolver } from "@/features/workspace/workspace-slug-resolver";
import type { McpUnavailableReason } from "./mcp-access";
import type { McpWorkspaceSelection } from "./mcp-workspace-context";

import { mcpUnavailableReason } from "./mcp-access";

export type McpWorkspaceOption = {
  companyId: string;
  name: string | null;
  slug: string;
  roleName: string | null;
  isAdmin: boolean;
  createdAt: Date;
  subscription: WorkspaceMembershipRow["company"]["subscription"];
  unavailableReason: McpUnavailableReason | null;
};

export type McpWorkspaceResolution = { ok: true; workspace: McpWorkspaceSelection } | { ok: false; message: string };

const UNAVAILABLE_EXPLANATIONS: Record<McpUnavailableReason, string> = {
  pending: "the request to join it is still waiting for approval",
  inactive: "your access to it is deactivated",
  permission: "your role there has no Read access All on API & Webhooks",
  plan: "it has no active subscription",
  terms: "updated terms must first be accepted in the app",
};

function label(option: Pick<McpWorkspaceOption, "name" | "slug">): string {
  return `${option.name?.trim() || "Unnamed workspace"} (${option.slug})`;
}

function choices(options: McpWorkspaceOption[]): string {
  return options.map(label).join(", ");
}

export function mcpUnavailableExplanation(reason: McpUnavailableReason): string {
  return UNAVAILABLE_EXPLANATIONS[reason];
}

export class McpWorkspaceAccessService {
  constructor(
    private readonly memberships: Pick<WorkspaceMembershipRepo, "listWorkspaceMembershipsUnscoped">,
    private readonly routeGuard: Pick<RouteGuardService, "resolveMcpMembership">,
    private readonly slugs: Pick<WorkspaceSlugResolver, "slugFor">,
  ) {}

  async listWorkspaces(email: string): Promise<McpWorkspaceOption[]> {
    const rows = await this.memberships.listWorkspaceMembershipsUnscoped(email);
    return Promise.all(
      rows.map(async (row) => ({
        companyId: row.companyId,
        name: row.company.name,
        slug: row.company.slug,
        roleName: row.role?.name ?? null,
        isAdmin: row.role?.isSystemRole ?? false,
        createdAt: row.company.createdAt,
        subscription: row.company.subscription,
        unavailableReason: await mcpUnavailableReason(
          { companyId: row.companyId, status: row.status, subscription: row.company.subscription },
          (companyId) => this.routeGuard.resolveMcpMembership(email, companyId),
        ),
      })),
    );
  }

  async resolve(email: string, requested: string | null): Promise<McpWorkspaceResolution> {
    const options = await this.listWorkspaces(email);
    const usable = options.filter((option) => option.unavailableReason === null);

    if (requested !== null) {
      const match = options.find((option) => option.slug === requested || option.companyId === requested);
      if (!match) {
        return {
          ok: false,
          message: usable.length
            ? `This account has no workspace "${requested}". Pass workspace with one of: ${choices(usable)}.`
            : `This account has no workspace "${requested}". Call list_workspaces to see the account's workspaces.`,
        };
      }
      if (match.unavailableReason) {
        return {
          ok: false,
          message: `The workspace ${label(match)} cannot be used through MCP: ${mcpUnavailableExplanation(match.unavailableReason)}.`,
        };
      }
      return { ok: true, workspace: { companyId: match.companyId, slug: match.slug } };
    }

    if (usable.length === 1) return { ok: true, workspace: { companyId: usable[0].companyId, slug: usable[0].slug } };
    if (usable.length === 0) {
      return {
        ok: false,
        message:
          "This account has no workspace the agent can use yet. Call list_workspaces to see why, or ask the user and call create_workspace to create one.",
      };
    }
    return {
      ok: false,
      message: `This account has several workspaces. Ask the user which one to use if it is not clear, then pass workspace with its slug: ${choices(usable)}.`,
    };
  }

  async defaultWorkspace(email: string, preferredCompanyId: string | null): Promise<McpWorkspaceSelection | null> {
    const usable = (await this.listWorkspaces(email)).filter((option) => option.unavailableReason === null);
    const chosen =
      usable.find((option) => option.companyId === preferredCompanyId) ?? (usable.length === 1 ? usable[0] : null);
    return chosen ? { companyId: chosen.companyId, slug: chosen.slug } : null;
  }

  async isWorkspace(companyId: string, requested: string): Promise<boolean> {
    return requested === companyId || (await this.slugs.slugFor(companyId)) === requested;
  }
}
