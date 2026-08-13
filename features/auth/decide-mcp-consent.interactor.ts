import type { Data, Validated } from "@/core/validation/validation.utils";
import type { AuthService } from "./auth.service";
import type { RouteGuardService } from "./route-guard.service";

import { z } from "zod";

import { AllowInDemoMode } from "@/core/decorators/allow-in-demo-mode.decorator";
import { SystemInteractor } from "@/core/decorators/system-interactor.decorator";
import { Validate } from "@/core/decorators/validate.decorator";
import { ValidateOutput } from "@/core/decorators/validate-output.decorator";

const Schema = z.object({
  consentCode: z.string().min(1),
  accept: z.boolean(),
});
export type DecideMcpConsentData = Data<typeof Schema>;

const OutputSchema = z.object({ redirectURI: z.url() }).nullable();
export type DecideMcpConsentResult = Data<typeof OutputSchema>;

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
    if (resolution.state !== "allowed") return { ok: true, data: null };

    return { ok: true, data: await this.authService.decideMcpConsent(data) };
  }
}
