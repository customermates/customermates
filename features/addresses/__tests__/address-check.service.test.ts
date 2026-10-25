import { describe, expect, it, vi } from "vitest";

import type { RecordAddress } from "@/features/records/record-model.schema";
import type { PostalCodeLookup } from "../postal-codes/postal-code.service";

import { AddressCheckService } from "../address-check.service";

function address(values: Partial<RecordAddress>): RecordAddress {
  return {
    street: null,
    line2: null,
    postalCode: null,
    city: null,
    region: null,
    countryCode: null,
    formatted: "",
    location: null,
    verification: { status: "unverified", provider: null, checkedAt: null },
    ...values,
  };
}

function directory(answer: PostalCodeLookup) {
  return { lookup: vi.fn().mockResolvedValue(answer) };
}

describe("address check service", () => {
  it("normalises the parts, places the address at its postal code and reports the directory's places", async () => {
    const postalCodes = directory({
      status: "ready",
      match: "exact",
      cityChecked: true,
      postalCode: "68259",
      places: [{ city: "Mannheim", region: null, latitude: 49.49, longitude: 8.53 }],
    });
    const service = new AddressCheckService(postalCodes);
    const inspected = await service.inspect(
      address({ street: "Hauptstraße 5", postalCode: "D-68259", city: "Mannheim", countryCode: "de" }),
    );
    expect(postalCodes.lookup).toHaveBeenCalledWith("de", "68259");
    expect(inspected).toEqual({
      address: expect.objectContaining({
        postalCode: "68259",
        formatted: "Hauptstraße 5, 68259 Mannheim",
        location: { lat: 49.49, lon: 8.53, precision: "postcode" },
        verification: { status: "unverified", provider: null, checkedAt: null },
      }),
      issues: [],
      postalCode: {
        status: "ready",
        match: "exact",
        places: [{ city: "Mannheim", region: null, latitude: 49.49, longitude: 8.53 }],
      },
    });
  });

  it("does not search the directory for an address with a refused part", async () => {
    const postalCodes = directory({ status: "pending" });
    const inspected = await new AddressCheckService(postalCodes).inspect(
      address({ postalCode: "6825", city: "Mannheim", countryCode: "de" }),
    );
    expect(postalCodes.lookup).not.toHaveBeenCalled();
    expect(inspected.issues).toEqual([
      { code: "postalCodeInvalid", severity: "error", part: "postalCode", example: "26133" },
    ]);
    expect(inspected.postalCode).toEqual({ status: "notChecked", match: null, places: [] });
  });

  it("keeps the format checks while a country's postal codes load or when the directory is off", async () => {
    const loading = await new AddressCheckService(directory({ status: "pending" })).inspect(
      address({ street: "Hauptstraße 5", postalCode: "68259", countryCode: "de" }),
    );
    expect(loading.issues).toEqual([{ code: "partMissing", severity: "warning", part: "city" }]);
    expect(loading.postalCode).toEqual({ status: "loading", match: null, places: [] });
    expect(loading.address.location).toBeNull();
    const off = await new AddressCheckService(directory({ status: "unavailable" })).inspect(
      address({ postalCode: "68259", countryCode: "de" }),
    );
    expect(off.postalCode.status).toBe("unavailable");
    const without = await new AddressCheckService(null).inspect(address({ postalCode: "68259", countryCode: "de" }));
    expect(without.postalCode.status).toBe("unavailable");
  });

  it("leaves an address that is only text unchanged", async () => {
    const text = address({ formatted: "Somewhere 1, Atlantis" });
    expect(await new AddressCheckService(null).check(text)).toEqual({ address: text, issues: [] });
  });
});
