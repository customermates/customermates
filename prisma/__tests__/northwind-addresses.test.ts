import { describe, expect, it } from "vitest";

import { checkAddressFormat } from "@/features/addresses/address-check";
import { addressFormatOf, isKnownAddressCountry } from "@/features/addresses/address-metadata";
import { northwindOrganizationAddress } from "../seeds/northwind-addresses";
import { northwindDataset } from "../seeds/northwind-data";

describe("demo organization addresses", () => {
  it("are complete postal addresses that every address write would accept unchanged", () => {
    const problems = northwindDataset().organizations.flatMap((organization) => {
      const address = northwindOrganizationAddress(organization);
      const checked = checkAddressFormat(address, addressFormatOf, isKnownAddressCountry);
      const changed = (["postalCode", "region"] as const).filter((part) => checked.parts[part] !== address[part]);
      return [
        ...checked.issues.map((issue) => `${organization.name}: ${issue.code} ${issue.part}`),
        ...changed.map((part) => `${organization.name}: ${part} ${address[part]} becomes ${checked.parts[part]}`),
      ];
    });
    expect(problems).toEqual([]);
  });
});
