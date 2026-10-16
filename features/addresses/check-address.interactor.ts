import type { Validated } from "@/core/validation/validation.utils";
import type { AddressCheckService } from "./address-check.service";

import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { AllowInDemoMode } from "@/core/decorators/allow-in-demo-mode.decorator";
import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { Validate } from "@/core/decorators/validate.decorator";
import { ValidateOutput } from "@/core/decorators/validate-output.decorator";
import { unverifiedRecordAddress } from "@/features/records/record-address";
import { UNVERIFIED_ADDRESS } from "@/features/records/record-address-value";
import { addressIssueSentence } from "./address-issue-text";
import {
  AddressCheckResultSchema,
  CheckAddressSchema,
  MAX_POSTAL_CODE_PLACES,
  POSTAL_CODE_ATTRIBUTION,
  type AddressCheckResult,
  type CheckAddressInput,
} from "./address-check.schema";

const EMPTY_ADDRESS = {
  street: null,
  line2: null,
  postalCode: null,
  city: null,
  region: null,
  countryCode: null,
  formatted: "",
  location: null,
  verification: UNVERIFIED_ADDRESS,
};

@AllowInDemoMode
@TenantInteractor()
export class CheckAddressInteractor extends AuthenticatedInteractor<CheckAddressInput, AddressCheckResult> {
  constructor(private readonly addresses: Pick<AddressCheckService, "inspect">) {
    super();
  }

  @Validate(CheckAddressSchema)
  @ValidateOutput(AddressCheckResultSchema)
  async invoke(input: CheckAddressInput): Validated<AddressCheckResult> {
    const address =
      unverifiedRecordAddress({
        ...EMPTY_ADDRESS,
        street: input.street ?? null,
        line2: input.line2 ?? null,
        postalCode: input.postalCode ?? null,
        city: input.city ?? null,
        region: input.region ?? null,
        countryCode: input.countryCode ?? null,
      }) ?? EMPTY_ADDRESS;
    const inspection = await this.addresses.inspect(address);
    const places = inspection.postalCode.places.slice(0, MAX_POSTAL_CODE_PLACES);
    return {
      ok: true,
      data: {
        address: inspection.address,
        issues: inspection.issues.map((issue) => ({
          code: issue.code,
          severity: issue.severity,
          part: issue.part,
          message: addressIssueSentence(issue),
          ...(issue.example ? { example: issue.example } : {}),
          ...(issue.expected?.length ? { expected: issue.expected } : {}),
        })),
        postalCode: {
          status: inspection.postalCode.status,
          match: inspection.postalCode.match,
          places: places.map((place) => ({
            city: place.city,
            region: place.region,
            location: { lat: place.latitude, lon: place.longitude, precision: "postcode" as const },
          })),
        },
        attribution: places.length ? POSTAL_CODE_ATTRIBUTION : null,
      },
    };
  }
}
