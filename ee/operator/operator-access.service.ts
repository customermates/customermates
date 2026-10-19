import type { AuthService } from "@/features/auth/auth.service";
import type { OperatorActor } from "@/core/decorators/operator-context";
import type { OperatorAccessRepo } from "./operator-access.repo";

import { AppErrorCode, AuthError, ForbiddenError, appErrorDetails } from "@/core/errors/app-errors";
import { env } from "@/env";

export function normalizeOperatorEmail(email: string): string {
  return email.trim().toLocaleLowerCase("en-US");
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

  async authorizeRead(): Promise<OperatorActor> {
    if (!(await this.authService.isIntegrationCredentialRequest())) return this.authorizeFresh();
    if (env.APP_MODE !== "cloud") throw new ForbiddenError("Operator console is unavailable");

    const session = await this.authService.getSession();
    if (!session) throw new AuthError();

    const actor = await this.repo.findAuthorizedIntegrationActorUnscoped(session);
    if (!actor) throw new ForbiddenError("Platform operator access required");

    return actor;
  }

  async isEligible(): Promise<boolean> {
    return this.eligible(() => this.authorizeFresh());
  }

  async isReadEligible(): Promise<boolean> {
    return this.eligible(() => this.authorizeRead());
  }

  private async eligible(authorize: () => Promise<OperatorActor>): Promise<boolean> {
    try {
      await authorize();
      return true;
    } catch (error) {
      const details = appErrorDetails(error);
      if (details?.code === AppErrorCode.unauthenticated || details?.code === AppErrorCode.permissionDenied)
        return false;
      throw error;
    }
  }
}
