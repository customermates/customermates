import { describe, expect, it } from "vitest";

import type { RecordFieldView } from "../record-model.schema";

import { formatAddressStreet, verifiedRecordAddress } from "../record-address";
import {
  addressDraftParts,
  isVerifiedAddressDraft,
  recordDraftValue,
  recordInputValue,
  recordWriteValue,
  verifiedAddressDraft,
} from "../record-input-value";

const FIELD = {
  id: "00000000-0000-4000-8000-0000000000f1",
  typeId: "00000000-0000-4000-8000-0000000000f0",
  label: "Address",
  valueType: "address",
  behavior: { kind: "input" },
  required: false,
  archived: false,
  publishedSummary: false,
  options: [],
  position: 1,
} as unknown as RecordFieldView;

const PARTS = {
  street: "Hauptstraße 5",
  line2: null,
  postalCode: "68259",
  city: "Mannheim",
  region: "Baden-Württemberg",
  countryCode: "de",
};

const VERIFIED = verifiedRecordAddress(PARTS, {
  provider: "photon",
  checkedAt: "2026-10-15T08:00:00.000Z",
  location: { lat: 49.4857901, lon: 8.5370071 },
});

describe("address street lines", () => {
  it("place the house number the way the country writes it", () => {
    expect(formatAddressStreet("Hauptstraße", "5", "de")).toBe("Hauptstraße 5");
    expect(formatAddressStreet("Main Street", "1600", "us")).toBe("1600 Main Street");
    expect(formatAddressStreet("Rue de Rivoli", "10", "fr")).toBe("10 Rue de Rivoli");
    expect(formatAddressStreet("Calle Mayor", "3", "es")).toBe("Calle Mayor, 3");
    expect(formatAddressStreet("Hauptstraße", null, "de")).toBe("Hauptstraße");
  });
});

describe("address editor drafts", () => {
  it("remember that a stored address is verified while its parts are unchanged", () => {
    const draft = recordDraftValue({ kind: "address", value: VERIFIED }, FIELD);
    expect(draft).toEqual({ ...PARTS, verified: PARTS });
    expect(isVerifiedAddressDraft(draft)).toBe(true);
    expect(isVerifiedAddressDraft({ ...(draft as object), street: "Hauptstraße 7" })).toBe(false);
    expect(isVerifiedAddressDraft({ ...(draft as object), street: " Hauptstraße 5 " })).toBe(true);
    expect(
      isVerifiedAddressDraft(
        recordDraftValue(
          {
            kind: "address",
            value: { ...VERIFIED, verification: { status: "unverified", provider: null, checkedAt: null } },
          },
          FIELD,
        ),
      ),
    ).toBe(false);
  });

  it("send a picked candidate's token until a part changes", () => {
    const picked = verifiedAddressDraft(addressDraftParts(VERIFIED), "candidate-token");
    expect(recordWriteValue(picked, FIELD)).toEqual({ kind: "address", candidateToken: "candidate-token" });
    expect(recordInputValue(picked, FIELD)).toMatchObject({
      kind: "address",
      value: { street: "Hauptstraße 5", verification: { status: "unverified" } },
    });
    const edited = { ...picked, line2: "3. OG" };
    expect(isVerifiedAddressDraft(edited)).toBe(false);
    expect(recordWriteValue(edited, FIELD)).toMatchObject({
      kind: "address",
      value: { street: "Hauptstraße 5", line2: "3. OG", verification: { status: "unverified" } },
    });
    expect(recordWriteValue({ ...edited, line2: "" }, FIELD)).toEqual({
      kind: "address",
      candidateToken: "candidate-token",
    });
  });

  it("never send a token for an empty draft or another field type", () => {
    const empty = verifiedAddressDraft(addressDraftParts({}), "candidate-token");
    expect(isVerifiedAddressDraft(empty)).toBe(false);
    expect(recordWriteValue(empty, FIELD)).toBeNull();
    expect(recordWriteValue("Mannheim", { ...FIELD, valueType: "text" } as RecordFieldView)).toEqual({
      kind: "text",
      value: "Mannheim",
    });
  });
});
