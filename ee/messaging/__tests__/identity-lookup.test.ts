import { describe, expect, it } from "vitest";
import { identityLookupValue } from "../identity-lookup";
import { participantLookupValue } from "@/prisma/record-migrations/v3/participant-identities";

describe("participant identity lookup", () => {
  it.each([
    ["mail", " Person@Example.test ", "person@example.test"],
    ["google", "person@example.test", "person@example.test"],
    ["outlook", " PERSON@example.test ", "person@example.test"],
    ["whatsapp", "+49 (151) 12345678", "+4915112345678"],
    ["linkedin", " https://www.linkedin.com/in/Zo%C3%AB/ ", "Zoë"],
    ["telegram", "@person", "person"],
    ["instagram", "https://instagram.com/person", "person"],
    ["linkedin", "urn:li:person:123", "urn:li:person:123"],
    ["linkedin", "opaque%broken", "opaque%broken"],
    ["telegram", "123456789", "123456789"],
    ["whatsapp", "not-a-number", "not-a-number"],
    ["mail", "invalid-address", "invalid-address"],
    ["mail", "  ", null],
    ["linkedin", null, null],
  ] as const)(
    "normalizes %s identifier %s identically in the reader, writer and versioned backfill",
    (provider, value, expected) => {
      expect(identityLookupValue(provider, value)).toBe(expected);
      expect(participantLookupValue(provider, value)).toBe(expected);
    },
  );
});
