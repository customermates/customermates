import type { AdAttributionCookieRepo } from "./ad-attribution.repo";
import type { RouteGuardService } from "@/features/auth/route-guard.service";
import type { Validated } from "@/core/validation/validation.utils";

import { z } from "zod";

import { runWithTenant } from "@/core/decorators/tenant-context";
import { SystemInteractor } from "@/core/decorators/system-interactor.decorator";
import { ValidateOutput } from "@/core/decorators/validate-output.decorator";
import { env } from "@/env";

export abstract class WithdrawAdAttributionRepo {
  abstract clearAdAttributionForUser(args: { userId: string }): Promise<boolean>;
}

@SystemInteractor
export class WithdrawAdAttributionInteractor {
  constructor(
    private readonly routeGuardService: RouteGuardService,
    private readonly repo: WithdrawAdAttributionRepo,
    private readonly cookieRepo: AdAttributionCookieRepo,
  ) {}

  @ValidateOutput(z.boolean())
  async invoke(): Validated<boolean> {
    if (env.APP_MODE !== "cloud") return { ok: true as const, data: false };

    const stored = await this.cookieRepo.readCookie();
    if (!stored || stored.consent.advertising) return { ok: true as const, data: false };

    const { user } = await this.routeGuardService.resolveAccountState();
    if (!user) return { ok: true as const, data: false };

    const cleared = await runWithTenant(user, () => this.repo.clearAdAttributionForUser({ userId: user.id }));
    return { ok: true as const, data: cleared };
  }
}
