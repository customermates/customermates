import type { AddressFormatSource } from "./address-country-format";
import type { AddressIssue, PostalCodePlace } from "./address-check";
import type { PostalCodeService } from "./postal-codes/postal-code.service";
import type { RecordAddress } from "@/features/records/record-model.schema";
import type { RecordAddressParts } from "@/features/records/record-address-lines";

import { UNVERIFIED_ADDRESS } from "@/features/records/record-address-value";
import { formatRecordAddress } from "@/features/records/record-address";
import { addressFormatOf, isKnownAddressCountry } from "./address-metadata";
import { checkAddressFormat, checkAddressPlaces, isBlockingAddressIssue } from "./address-check";

type PostalCodeDirectoryStatus = "ready" | "loading" | "unavailable" | "notChecked";

type PostalCodeDirectoryMatch = "exact" | "area" | "none";

type RecordAddressCheck = { address: RecordAddress; issues: AddressIssue[] };

type AddressInspection = RecordAddressCheck & {
  postalCode: { status: PostalCodeDirectoryStatus; match: PostalCodeDirectoryMatch | null; places: PostalCodePlace[] };
};

function partsOf(address: RecordAddressParts): RecordAddressParts {
  return {
    street: address.street,
    line2: address.line2,
    postalCode: address.postalCode,
    city: address.city,
    region: address.region,
    countryCode: address.countryCode,
  };
}

export class AddressCheckService {
  constructor(
    private readonly postalCodes: Pick<PostalCodeService, "lookup"> | null = null,
    private readonly formatOf: AddressFormatSource = addressFormatOf,
    private readonly isKnownCountry: (countryCode: string) => boolean = isKnownAddressCountry,
  ) {}

  async inspect(address: RecordAddress): Promise<AddressInspection> {
    const checked = checkAddressFormat(partsOf(address), this.formatOf, this.isKnownCountry);
    const parts = checked.parts;
    const base: RecordAddress = Object.values(parts).some(Boolean)
      ? {
          ...address,
          ...parts,
          formatted: formatRecordAddress(parts),
          location: null,
          verification: UNVERIFIED_ADDRESS,
        }
      : address;
    const issues: AddressIssue[] = checked.issues;
    if (!parts.countryCode || !parts.postalCode || issues.some(isBlockingAddressIssue))
      return { address: base, issues, postalCode: { status: "notChecked", match: null, places: [] } };
    if (!this.postalCodes)
      return { address: base, issues, postalCode: { status: "unavailable", match: null, places: [] } };
    const lookup = await this.postalCodes.lookup(parts.countryCode, parts.postalCode);
    if (lookup.status !== "ready") {
      return {
        address: base,
        issues,
        postalCode: { status: lookup.status === "pending" ? "loading" : "unavailable", match: null, places: [] },
      };
    }
    const placed = checkAddressPlaces(parts, lookup, this.formatOf(parts.countryCode), issues);
    return {
      address: { ...base, location: placed.location },
      issues: [...issues, ...placed.issues],
      postalCode: { status: "ready", match: lookup.match, places: lookup.places },
    };
  }

  async check(address: RecordAddress): Promise<RecordAddressCheck> {
    const { address: checked, issues } = await this.inspect(address);
    return { address: checked, issues };
  }
}
