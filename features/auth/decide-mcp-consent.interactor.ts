import type { Data, Validated } from "@/core/validation/validation.utils";
import type { AuthService } from "./auth.service";
import type { RouteGuardService } from "./route-guard.service";

import { z } from "zod";

import { AllowInDemoMode } from "@/core/decorators/allow-in-demo-mode.decorator";
import { SystemInteractor } from "@/core/decorators/system-interactor.decorator";
import { Validate } from "@/core/decorators/validate.decorator";
import { ValidateOutput } from "@/core/decorators/validate-output.decorator";
import { canConnectMcp, isMcpConsentMemberState } from "./mcp-access";

const Schema = z.object({
  consentCode: z.string().min(1),
  accept: z.boolean(),
  companyId: z.string().min(1).optional(),
});
export type DecideMcpConsentData = Data<typeof Schema>;

const OutputSchema = z.object({ redirectURI: z.url() }).nullable();
type DecideMcpConsentResult = Data<typeof OutputSchema>;

@AllowInDemoMode
@SystemInteractor
export class DecideMcpConsentInteractor {
  constructor(
    private authService: AuthService,
    private routeGuardService: RouteGuardService,
  ) {}

  @Validate(Schema)
  @ValidateOutput(OutputSchema)
  async invoke(data: DecideMcpConsentData): Promise<Awaited<Validated<DecideMcpConsentResult>>> {
    const resolution = await this.routeGuardService.resolveAccountState();
    const state = await this.routeGuardService.resolveMcpConsentState(resolution);
    const current = state === "allowed" || state === "onboarding" ? resolution.user : null;
    const { companyId } = data;
    const choosesOther = companyId !== undefined && companyId !== resolution.user?.companyId;
    if (!current && !(choosesOther && isMcpConsentMemberState(resolution.state))) return { ok: true, data: null };

    const target = choosesOther ? await this.routeGuardService.resolveMembershipForConsent(companyId) : current;
    const accept = data.accept && target !== null && canConnectMcp(target.role);
    return {
      ok: true,
      data: await this.authService.decideMcpConsent({
        consentCode: data.consentCode,
        accept,
        companyId: target?.companyId ?? null,
      }),
    };
  }
}
