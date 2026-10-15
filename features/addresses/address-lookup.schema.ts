import { z } from "zod";

import type { Data } from "@/core/validation/validation.utils";

import { zx } from "@/core/validation/validation.utils";
import { RecordAddressSchema } from "@/features/records/record-model.schema";

const CountryFilterSchema = z
  .string()
  .regex(/^[a-z]{2}$/u)
  .nullish()
  .describe("Only addresses in this country: ISO 3166-1 alpha-2 code in lowercase, such as de.");

export const LookupAddressSchema = z
  .object({
    query: zx
      .nulFreeText()
      .trim()
      .min(3)
      .max(200)
      .describe("Free text as a person would type it, such as a street with house number and city or a place name."),
    countryCode: CountryFilterSchema,
    limit: z.number().int().min(1).max(10).default(5).describe("Most candidates to return, 1 to 10; default 5."),
  })
  .strict();
export type LookupAddressInput = Data<typeof LookupAddressSchema>;

const addressPart = (max: number) => zx.nulFreeText().max(max).nullish();

export const VerifyAddressSchema = z
  .object({
    street: addressPart(200).describe("Street with house number, as written in the country."),
    line2: addressPart(200).describe("Apartment, floor or c/o; kept as entered and never checked."),
    postalCode: addressPart(20),
    city: addressPart(200),
    region: addressPart(200),
    countryCode: CountryFilterSchema,
  })
  .strict();
export type VerifyAddressInput = Data<typeof VerifyAddressSchema>;

export const AddressCandidateSchema = z
  .object({
    candidateToken: z
      .string()
      .describe(
        'Valid for 24 hours in this workspace: write {"kind":"address","candidateToken":"…"} to an address field to store this address as verified.',
      ),
    name: z.string().nullable().describe("Name of the matched place, such as a business or building, or null."),
    address: RecordAddressSchema,
  })
  .strict();
export type AddressCandidate = Data<typeof AddressCandidateSchema>;

export const AddressLookupResultSchema = z
  .object({
    available: z
      .boolean()
      .describe(
        "False when address lookup is off on this server; then write the address parts, which stay unverified.",
      ),
    attribution: z
      .string()
      .nullable()
      .describe("Source credit to show with the candidates, such as © OpenStreetMap contributors."),
    candidates: z.array(AddressCandidateSchema),
  })
  .strict();
export type AddressLookupResult = Data<typeof AddressLookupResultSchema>;

export const AddressVerificationResultSchema = z
  .object({
    available: z.boolean().describe("False when address lookup is off on this server."),
    attribution: z.string().nullable(),
    match: AddressCandidateSchema.nullable().describe(
      "The provider's address when its postal code and city and, when given, its street and house number equal the input; it keeps the input's line2. Null when nothing matches.",
    ),
  })
  .strict();
export type AddressVerificationResult = Data<typeof AddressVerificationResultSchema>;
