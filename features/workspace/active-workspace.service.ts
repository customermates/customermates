import type { AuthenticatedSession, AuthService } from "@/features/auth/auth.service";
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
    const email = session.user.email;
    const binding = await this.authService.getCredentialWorkspace(session, headersList);

    if (binding.kind === "integration")
      return binding.companyId ? this.users.findMembershipUnscoped(email, binding.companyId) : null;

    if (binding.companyId) {
      const selected = await this.users.findMembershipUnscoped(email, binding.companyId);
      if (selected) return selected;
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

    return membership;
  }
}
