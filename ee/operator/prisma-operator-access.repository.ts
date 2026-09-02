import type { InteractiveSession } from "@/features/auth/auth.service";
import type { OperatorActor } from "@/core/decorators/operator-context";
import type { OperatorAccessRepo } from "./operator-access.service";

import { BaseRepository } from "@/core/base/base-repository";
import { BypassTenantGuard } from "@/core/decorators/bypass-tenant.decorator";
import { Status } from "@/generated/prisma";

import { normalizeOperatorEmail } from "./operator-access.service";

export class PrismaOperatorAccessRepo extends BaseRepository implements OperatorAccessRepo {
  @BypassTenantGuard
  async findAuthorizedActorUnscoped(session: InteractiveSession): Promise<OperatorActor | null> {
    const [freshSession, authUser] = await Promise.all([
      this.prisma.authSession.findUnique({
        where: { id: session.session.id },
        select: { userId: true, expiresAt: true },
      }),
      this.prisma.authUser.findUnique({
        where: { id: session.user.id },
        select: { id: true, email: true, emailVerified: true },
      }),
    ]);
    if (!freshSession || freshSession.userId !== session.user.id || freshSession.expiresAt.getTime() <= Date.now())
      return null;
    if (!authUser?.emailVerified) return null;

    const sessionEmail = normalizeOperatorEmail(session.user.email);
    const freshAuthEmail = normalizeOperatorEmail(authUser.email);
    if (sessionEmail !== freshAuthEmail) return null;

    const operatorUserSelect = {
      id: true,
      email: true,
      companyId: true,
      status: true,
      isPlatformOperator: true,
    } as const;

    const user = await this.prisma.user.findUnique({
      where: { email: freshAuthEmail },
      select: operatorUserSelect,
    });
    if (!user) return null;

    if (
      user.status !== Status.active ||
      !user.isPlatformOperator ||
      normalizeOperatorEmail(user.email) !== freshAuthEmail
    )
      return null;

    return {
      authUserId: authUser.id,
      userId: user.id,
      companyId: user.companyId,
      email: freshAuthEmail,
    };
  }
}
