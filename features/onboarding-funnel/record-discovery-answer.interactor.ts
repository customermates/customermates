import type { Redirect } from "@/features/auth/auth-outcome";
import type { RouteGuardService } from "@/features/auth/route-guard.service";
import type { Validated } from "@/core/validation/validation.utils";
import type { DiscoveryAnswerRepo } from "./discovery-answer.repo";

import { z } from "zod";

import { runWithTenant } from "@/core/decorators/tenant-context";
import { SystemInteractor } from "@/core/decorators/system-interactor.decorator";
import { Validate } from "@/core/decorators/validate.decorator";
import { env } from "@/env";
import { accountStateRedirect } from "@/features/auth/account-state";
import { redirectTo } from "@/features/auth/auth-outcome";
import { DISCOVERY_DETAIL_MAX_LENGTH, DiscoveryChoiceSchema } from "./discovery-answer";

const Schema = z.strictObject({
  choice: DiscoveryChoiceSchema.nullable(),
  detail: z.string().trim().max(DISCOVERY_DETAIL_MAX_LENGTH).optional(),
});
export type RecordDiscoveryAnswerData = z.infer<typeof Schema>;

@SystemInteractor
export class RecordDiscoveryAnswerInteractor {
  constructor(
    private readonly repo: DiscoveryAnswerRepo,
    private readonly routeGuardService: RouteGuardService,
  ) {}

  @Validate(Schema)
  async invoke(data: RecordDiscoveryAnswerData): Promise<Awaited<Validated<{ recorded: boolean }>> | Redirect> {
    if (env.APP_MODE !== "cloud") return { ok: true as const, data: { recorded: false } };
    const resolution = await this.routeGuardService.resolveAccountState();
    if (resolution.state !== "onboarding") return redirectTo(accountStateRedirect(resolution.state) ?? "/");
    const user = resolution.user;
    if (!user) return redirectTo("/auth/signin");
    if (!user.role?.isSystemRole) return redirectTo("/");

    return runWithTenant(user, async () => ({
      ok: true as const,
      data: {
        recorded: await this.repo.recordDiscoveryAnswer({
          userId: user.id,
          choice: data.choice,
          detail: data.choice === "other" && data.detail ? data.detail : null,
        }),
      },
    }));
  }
}
