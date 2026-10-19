import type { InteractiveSession } from "@/features/auth/auth.service";
import type { OperatorActor } from "@/core/decorators/operator-context";
import type { OperatorAccessRepo } from "./operator-access.repo";

import { TenantRepository } from "@/core/base/tenant-repository";
import { BypassTenantGuard } from "@/core/decorators/bypass-tenant.decorator";
import { Status } from "@/generated/prisma";

import { normalizeOperatorEmail } from "./operator-access.service";

export class PrismaOperatorAccessRepo extends TenantRepository implements OperatorAccessRepo {
  @BypassTenantGuard
  async findAuthorizedActorUnscoped(session: InteractiveSession): Promise<OperatorActor | null> {
    const freshSession = await this.prisma.authSession.findUnique({
      where: { id: session.session.id },
      select: { userId: true, expiresAt: true },
    });
    if (!freshSession || freshSession.userId !== session.user.id || freshSession.expiresAt.getTime() <= Date.now())
      return null;

    return this.operatorActorForUnscoped(session);
  }

  @BypassTenantGuard
  async findAuthorizedIntegrationActorUnscoped(session: InteractiveSession): Promise<OperatorActor | null> {
    if (session.session.expiresAt.getTime() <= Date.now()) return null;

    return this.operatorActorForUnscoped(session);
  }

  @BypassTenantGuard
  private async operatorActorForUnscoped(session: InteractiveSession): Promise<OperatorActor | null> {
    const authUser = await this.prisma.authUser.findUnique({
      where: { id: session.user.id },
      select: { id: true, email: true, emailVerified: true, isPlatformOperator: true },
    });
    if (!authUser?.emailVerified || !authUser.isPlatformOperator) return null;

    const sessionEmail = normalizeOperatorEmail(session.user.email);
    const freshAuthEmail = normalizeOperatorEmail(authUser.email);
    if (sessionEmail !== freshAuthEmail) return null;

    const user = await this.prisma.user.findFirst({
      where: { email: freshAuthEmail, status: Status.active, leftAt: null },
      orderBy: [{ lastActiveAt: { sort: "desc", nulls: "last" } }, { createdAt: "asc" }],
      select: { id: true, companyId: true },
    });
    if (!user) return null;

    return {
      authUserId: authUser.id,
      userId: user.id,
      companyId: user.companyId,
      email: freshAuthEmail,
    };
  }
}
