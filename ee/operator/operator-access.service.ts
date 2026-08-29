import type { InteractiveSession, AuthService } from "@/features/auth/auth.service";
import type { OperatorActor } from "@/core/decorators/operator-context";

import { AppErrorCode, AuthError, ForbiddenError, appErrorDetails } from "@/core/errors/app-errors";
import { BypassTenantGuard } from "@/core/decorators/bypass-tenant.decorator";
import { BaseRepository } from "@/core/base/base-repository";
import { Status } from "@/generated/prisma";
import { env } from "@/env";

export function normalizeOperatorEmail(email: string): string {
  return email.trim().toLocaleLowerCase("en-US");
}

export abstract class OperatorAccessRepo {
  abstract findAuthorizedActorUnscoped(session: InteractiveSession): Promise<OperatorActor | null>;
}

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

export class OperatorAccessService {
  constructor(
    private readonly authService: AuthService,
    private readonly repo: OperatorAccessRepo,
  ) {}

  async authorizeFresh(): Promise<OperatorActor> {
    if (env.APP_MODE !== "cloud" || env.OPERATOR_CONSOLE_ENABLED !== true)
      throw new ForbiddenError("Operator console is unavailable");

    const session = await this.authService.getInteractiveSession();
    if (!session) throw new AuthError();

    const actor = await this.repo.findAuthorizedActorUnscoped(session);
    if (!actor) throw new ForbiddenError("Platform operator access required");

    return actor;
  }

  async isEligible(): Promise<boolean> {
    try {
      await this.authorizeFresh();
      return true;
    } catch (error) {
      const details = appErrorDetails(error);
      if (details?.code === AppErrorCode.unauthenticated || details?.code === AppErrorCode.permissionDenied)
        return false;
      throw error;
    }
  }
}
