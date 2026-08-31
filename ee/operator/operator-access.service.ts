import type { InteractiveSession, AuthService } from "@/features/auth/auth.service";
import type { OperatorActor } from "@/core/decorators/operator-context";

import { AppErrorCode, AuthError, ForbiddenError, appErrorDetails } from "@/core/errors/app-errors";
import { env } from "@/env";

export function normalizeOperatorEmail(email: string): string {
  return email.trim().toLocaleLowerCase("en-US");
}

export abstract class OperatorAccessRepo {
  abstract findAuthorizedActorUnscoped(session: InteractiveSession): Promise<OperatorActor | null>;
}

export class OperatorAccessService {
  constructor(
    private readonly authService: AuthService,
    private readonly repo: OperatorAccessRepo,
  ) {}

  async authorizeFresh(): Promise<OperatorActor> {
    if (env.APP_MODE !== "cloud") throw new ForbiddenError("Operator console is unavailable");

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
