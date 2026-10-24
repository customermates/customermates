import type { Validated } from "@/core/validation/validation.utils";
import type { AddressLookupService } from "./address-lookup.service";

import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { AllowInDemoMode } from "@/core/decorators/allow-in-demo-mode.decorator";
import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { Validate } from "@/core/decorators/validate.decorator";
import { ValidateOutput } from "@/core/decorators/validate-output.decorator";
import { failRateLimit, failUnavailable } from "@/core/validation/interactor-failure-server";
import { CustomErrorCode } from "@/core/validation/validation.types";
import { addressLookupCaller } from "./address-lookup-caller";
import {
  AddressVerificationResultSchema,
  VerifyAddressSchema,
  type AddressVerificationResult,
  type VerifyAddressInput,
} from "./address-lookup.schema";

@AllowInDemoMode
@TenantInteractor()
export class VerifyAddressInteractor extends AuthenticatedInteractor<VerifyAddressInput, AddressVerificationResult> {
  constructor(private readonly addresses: AddressLookupService) {
    super();
  }

  @Validate(VerifyAddressSchema)
  @ValidateOutput(AddressVerificationResultSchema)
  async invoke(input: VerifyAddressInput): Validated<AddressVerificationResult> {
    const outcome = await this.addresses.verify(await addressLookupCaller(this.user), input);
    if (outcome.status === "rate_limited") return failRateLimit(CustomErrorCode.addressLookupRateLimited);
    if (outcome.status === "unavailable") return failUnavailable(CustomErrorCode.addressLookupUnavailable);
    if (outcome.status === "off") return { ok: true, data: { available: false, attribution: null, match: null } };
    return {
      ok: true,
      data: { available: true, attribution: outcome.attribution, match: outcome.candidates[0] ?? null },
    };
  }
}
