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
    const { membership, binding } = await this.resolve(session);
    if (!membership && binding.kind === "session" && !binding.documentRequest) throw new WorkspaceChangedError();

    return membership;
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

    if (binding.companyId) {
      const selected = await this.users.findMembershipUnscoped(email, binding.companyId);
      if (selected) return { membership: selected, binding };
      if (!binding.documentRequest) throw new WorkspaceChangedError();
    }

    const memberships = await this.users.listMembershipsUnscoped(email);
    const lastUsedCompanyId = await this.users.findAuthUserCompanyIdUnscoped(session.user.id);
    const fallback =
      memberships.find((membership) => membership.companyId === lastUsedCompanyId) ??
      memberships.find((membership) => membership.status === Status.active) ??
      memberships[0];
    const membership = fallback ? await this.users.findMembershipUnscoped(email, fallback.companyId) : null;

    if (membership) await this.authService.setSessionActiveCompany(binding.sessionId, membership.companyId);
    else if (binding.companyId) await this.authService.setSessionActiveCompany(binding.sessionId, null);

    return { membership, binding };
  }
}
