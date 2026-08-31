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
        select: { id: true, email: true, emailVerified: true, companyId: true },
      }),
    ]);
    if (!freshSession || freshSession.userId !== session.user.id || freshSession.expiresAt.getTime() <= Date.now())
      return null;
    if (!authUser?.emailVerified) return null;

    const sessionEmail = normalizeOperatorEmail(session.user.email);
    const freshAuthEmail = normalizeOperatorEmail(authUser.email);
    if (sessionEmail !== freshAuthEmail) return null;

    const users = await this.prisma.user.findMany({
      where: { email: { equals: freshAuthEmail, mode: "insensitive" } },
      take: 2,
      select: {
        id: true,
        email: true,
        companyId: true,
        status: true,
        isPlatformOperator: true,
      },
    });
    if (users.length !== 1) return null;

    const user = users[0];
    if (
      user.status !== Status.active ||
      !user.isPlatformOperator ||
      authUser.companyId !== user.companyId ||
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
