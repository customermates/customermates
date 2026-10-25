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
  AddressLookupResultSchema,
  LookupAddressSchema,
  type AddressLookupResult,
  type LookupAddressInput,
} from "./address-lookup.schema";

@AllowInDemoMode
@TenantInteractor()
export class LookupAddressInteractor extends AuthenticatedInteractor<LookupAddressInput, AddressLookupResult> {
  constructor(private readonly addresses: AddressLookupService) {
    super();
  }

  @Validate(LookupAddressSchema)
  @ValidateOutput(AddressLookupResultSchema)
  async invoke(input: LookupAddressInput): Validated<AddressLookupResult> {
    const outcome = await this.addresses.lookup(await addressLookupCaller(this.user), input);
    if (outcome.status === "rate_limited") return failRateLimit(CustomErrorCode.addressLookupRateLimited);
    if (outcome.status === "unavailable") return failUnavailable(CustomErrorCode.addressLookupUnavailable);
    if (outcome.status === "off") return { ok: true, data: { available: false, attribution: null, candidates: [] } };
    return { ok: true, data: { available: true, attribution: outcome.attribution, candidates: outcome.candidates } };
  }
}
