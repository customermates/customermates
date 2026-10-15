import { structuredOperation } from "@/core/openapi/structured-operation";

import {
  AddressLookupResultSchema,
  AddressVerificationResultSchema,
  LookupAddressSchema,
  VerifyAddressSchema,
} from "./address-lookup.schema";

const LOOKUP_PRIVACY =
  "The server asks the address provider on the caller's behalf, so the provider never sees the caller's IP address or session. When the operator has not configured ADDRESS_LOOKUP_URL, nothing leaves the server and available is false. Requests are limited to 30 per user in 10 seconds (429 addressLookupRateLimited), and a provider that does not answer within 2 seconds returns 422 addressLookupUnavailable.";

export const addressApiPaths = {
  "/v1/addresses/lookup": {
    post: structuredOperation({
      operationId: "lookupAddress",
      summary: "Look up postal addresses",
      description: `Finds postal addresses for free text, as the Search address box of an address field does: a street with house number and city, a postal code and city, or the name of a place. Each candidate carries its formatted address parts, the map location and a candidateToken. Write \`{"kind":"address","candidateToken":"…"}\` to an address field through /v1/records/mutate to store that candidate as a verified address; the token is valid for 24 hours and only in this workspace. Any other address write is stored as unverified, so a client cannot mark an address verified itself. countryCode limits the results to one country; without it, addresses in the caller's country come first. Show the attribution with the results. ${LOOKUP_PRIVACY}`,
      requires: "an active member of the workspace; no record permission, because a lookup changes nothing.",
      tag: "addresses",
      input: LookupAddressSchema,
      output: AddressLookupResultSchema,
      outputDescription: "Candidates in the provider's order, or available false when address lookup is off.",
      example: { query: "Hauptstraße 5, Mannheim", countryCode: "de", limit: 5 },
    }),
  },
  "/v1/addresses/verify": {
    post: structuredOperation({
      operationId: "verifyAddress",
      summary: "Check an address entered by hand",
      description: `Checks address parts entered by hand, as the Check address action of an address field does. The server asks the address provider for the formatted address and returns a match only when the provider's address has the same postal code and city and, when given, the same street and house number, compared without case, accents and common street abbreviations. The match keeps the input's line2 and carries a candidateToken: write it as \`{"kind":"address","candidateToken":"…"}\` to store the suggested address as verified, or write the parts as \`{"kind":"address","value":{…}}\` to keep them unverified. Input without a postal code or city returns no match. ${LOOKUP_PRIVACY}`,
      requires: "an active member of the workspace; no record permission, because a check changes nothing.",
      tag: "addresses",
      input: VerifyAddressSchema,
      output: AddressVerificationResultSchema,
      outputDescription: "The matching provider address with its candidateToken, or null.",
      example: { street: "Hauptstr. 5", postalCode: "68259", city: "Mannheim", countryCode: "de" },
    }),
  },
};
