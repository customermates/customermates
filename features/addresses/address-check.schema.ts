import { z } from "zod";

import type { Data } from "@/core/validation/validation.utils";

import { RecordAddressSchema } from "@/features/records/record-model.schema";
import { ADDRESS_ISSUE_CODES } from "./address-check";
import { VerifyAddressSchema } from "./address-lookup.schema";

export const POSTAL_CODE_ATTRIBUTION = "Postal codes: GeoNames (geonames.org), CC BY 4.0";
export const MAX_POSTAL_CODE_PLACES = 20;

export const CheckAddressSchema = VerifyAddressSchema.describe(
  "Address parts as a person entered them; the same parts an address field value takes.",
);
export type CheckAddressInput = Data<typeof CheckAddressSchema>;

const AddressIssueSchema = z
  .object({
    code: z
      .enum(ADDRESS_ISSUE_CODES)
      .describe(
        "Errors: countryUnknown (not an ISO 3166-1 alpha-2 code), postalCodeInvalid (does not fit the country's format), regionInvalid (a code that is not one of the country's region codes). Warnings: countryMissing, partMissing, regionUnknown, postalCodeRegionMismatch, cityMismatch.",
      ),
    severity: z
      .enum(["error", "warning"])
      .describe("error: writing this address is refused; warning: the address is saved and the warning returned."),
    part: z.enum(["street", "postalCode", "city", "region", "countryCode"]).describe("The address part concerned."),
    message: z.string().describe("The issue as an English sentence."),
    example: z.string().optional().describe("postalCodeInvalid: a postal code in the country's format."),
    expected: z
      .array(z.string())
      .max(5)
      .optional()
      .describe("cityMismatch: cities of the postal code; postalCodeRegionMismatch: its region codes."),
  })
  .strict();
export type AddressIssueOutput = Data<typeof AddressIssueSchema>;

const PostalCodePlaceSchema = z
  .object({
    city: z.string().nullable(),
    region: z.string().nullable().describe("The country's region code, as an address field stores it, or null."),
    location: z
      .object({
        lat: z.number().min(-90).max(90),
        lon: z.number().min(-180).max(180),
        precision: z.literal("postcode"),
      })
      .strict(),
  })
  .strict();

export const AddressCheckResultSchema = z
  .object({
    address: RecordAddressSchema.describe(
      "The parts as a write stores them: trimmed, the postal code in the country's format, the region as the country's code, and the centre of the postal code as location when the directory knows the code.",
    ),
    issues: z.array(AddressIssueSchema),
    postalCode: z
      .object({
        status: z
          .enum(["ready", "loading", "unavailable", "notChecked"])
          .describe(
            "ready: the directory was searched; loading: the country's postal codes are being loaded, try again in a minute; unavailable: no directory for this country or it is switched off on this server; notChecked: no country, no postal code, or an error above.",
          ),
        match: z
          .enum(["exact", "area", "none"])
          .nullable()
          .describe(
            "exact: the directory knows the postal code (or the area it lists for the country); area: only a broader area matched, so places are approximate; none: unknown to the directory.",
          ),
        places: z
          .array(PostalCodePlaceSchema)
          .max(MAX_POSTAL_CODE_PLACES)
          .describe(
            "Cities and regions of the postal code, most likely first; use them to fill an empty city or region.",
          ),
      })
      .strict(),
    attribution: z.string().nullable().describe("Source credit to show with places from the postal code directory."),
  })
  .strict();
export type AddressCheckResult = Data<typeof AddressCheckResultSchema>;
