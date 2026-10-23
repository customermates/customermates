import type { AuthenticatedSession, AuthService, CredentialWorkspace } from "@/features/auth/auth.service";
import type { FindUserRepo } from "@/features/user/find-user.repo";
import type { TenantUser } from "@/features/user/user.schema";

import { Status } from "@/generated/prisma";

import { WorkspaceChangedError } from "@/core/errors/workspace-changed-error";

export class ActiveWorkspaceService {
  constructor(
    private readonly authService: AuthService,
    private readonly users: FindUserRepo,
  ) {}

  async resolveMembership(session: AuthenticatedSession, headersList?: Headers): Promise<TenantUser | null> {
    return (await this.resolve(session, headersList)).membership;
  }

  async requireMembership(session: AuthenticatedSession): Promise<TenantUser | null> {
    return (await this.resolve(session)).membership;
  }

  async requestedWorkspaceSlug(session: AuthenticatedSession, headersList?: Headers): Promise<string | null> {
    const binding = await this.authService.getCredentialWorkspace(session, headersList);
    return binding.kind === "session" ? binding.workspaceSlug : null;
  }

  async rememberLastUsed(session: AuthenticatedSession, companyId: string): Promise<void> {
    if ((await this.users.findAuthUserCompanyIdUnscoped(session.user.id)) === companyId) return;

    await this.users.setLastUsedCompanyUnscoped(session.user.id, companyId);
  }

  async resolveLastUsed(session: AuthenticatedSession): Promise<TenantUser | null> {
    const memberships = await this.users.listMembershipsUnscoped(session.user.email);
    const lastUsedCompanyId = await this.users.findAuthUserCompanyIdUnscoped(session.user.id);
    const fallback =
      memberships.find((membership) => membership.companyId === lastUsedCompanyId) ??
      memberships.find((membership) => membership.status === Status.active) ??
      memberships[0];

    return fallback ? await this.users.findMembershipUnscoped(session.user.email, fallback.companyId) : null;
  }

  private async resolve(
    session: AuthenticatedSession,
    headersList?: Headers,
  ): Promise<{ membership: TenantUser | null; binding: CredentialWorkspace }> {
    const email = session.user.email;
    const binding = await this.authService.getCredentialWorkspace(session, headersList);

    if (binding.kind === "integration") {
      const membership = binding.companyId ? await this.users.findMembershipUnscoped(email, binding.companyId) : null;
      return { membership, binding };
    }

    if (binding.workspaceSlug) {
      const membership = await this.users.findMembershipBySlugUnscoped(email, binding.workspaceSlug);
      if (!membership) throw new WorkspaceChangedError();
      return { membership, binding };
    }

    return { membership: await this.resolveLastUsed(session), binding };
  }
}
