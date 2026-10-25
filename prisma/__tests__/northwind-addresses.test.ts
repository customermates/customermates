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

  it("sit at the centre of their postal code inside their country", () => {
    const bounds: Record<string, [number, number, number, number]> = {
      de: [47.2, 55.1, 5.8, 15.1],
      at: [46.3, 49.1, 9.5, 17.2],
      ch: [45.8, 47.9, 5.9, 10.5],
      nl: [50.7, 53.6, 3.3, 7.3],
      gb: [49.9, 60.9, -8.2, 1.8],
      ie: [51.4, 55.4, -10.5, -6.0],
      se: [55.3, 69.1, 11.0, 24.2],
    };
    for (const organization of northwindDataset().organizations) {
      const address = northwindOrganizationAddress(organization);
      const [south, north, west, east] = bounds[address.countryCode ?? ""];
      expect(address.location?.precision).toBe("postcode");
      expect(address.location?.lat).toBeGreaterThan(south);
      expect(address.location?.lat).toBeLessThan(north);
      expect(address.location?.lon).toBeGreaterThan(west);
      expect(address.location?.lon).toBeLessThan(east);
    }
  });
});
