import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { COUNTRY_CODES } from "@/constants/countries";
import {
  ADDRESS_METADATA_PATH,
  formatAddressMetadata,
  readAddressMetadataSnapshot,
} from "@/scripts/generate-address-metadata";
import { buildAddressMetadata } from "@/scripts/address-metadata/build-address-metadata";
import { ADDRESS_METADATA, addressFormatOf } from "../address-metadata";

describe("address metadata", () => {
  it("keeps the committed dataset a fixed point of the generator", async () => {
    expect(await formatAddressMetadata(readAddressMetadataSnapshot()), "run yarn address-metadata:generate").toBe(
      readFileSync(ADDRESS_METADATA_PATH, "utf8"),
    );
  });

  it("covers every country a record address can name", () => {
    const missing = COUNTRY_CODES.filter((code) => !ADDRESS_METADATA.countries[code]);
    expect(missing).toEqual([]);
  });

  it("only ships postal code patterns that compile and match their own examples", () => {
    const broken: string[] = [];
    for (const [country, metadata] of Object.entries(ADDRESS_METADATA.countries)) {
      const postalCode = metadata.postalCode;
      if (!postalCode) continue;
      const pattern = new RegExp(`^(?:${postalCode.pattern})$`, "iu");
      for (const example of postalCode.examples) if (!pattern.test(example)) broken.push(`${country}:${example}`);
    }
    for (const [country, metadata] of Object.entries(ADDRESS_METADATA.countries)) {
      for (const region of metadata.regions ?? []) {
        if (!region.zip) continue;
        try {
          new RegExp(`^(?:${region.zip})`, "iu");
        } catch {
          broken.push(`${country}/${region.key}:${region.zip}`);
        }
      }
    }
    expect(broken).toEqual([]);
  });

  it("keeps region keys unique and every format line within the known parts", () => {
    for (const [country, metadata] of Object.entries(ADDRESS_METADATA.countries)) {
      const keys = (metadata.regions ?? []).map((region) => region.key);
      expect(new Set(keys).size, country).toBe(keys.length);
      for (const part of metadata.lines.flat())
        expect(["street", "postalCode", "city", "region"], country).toContain(part);
      expect(metadata.lines.flat(), country).toEqual(expect.arrayContaining(["street", "city"]));
    }
  });

  it("describes German, US and Japanese addresses the way the post writes them", () => {
    expect(addressFormatOf("de")).toMatchObject({
      lines: [["street"], ["postalCode", "city"]],
      required: ["street", "postalCode", "city"],
      postalCodeLabel: "postal",
      regions: [],
    });
    expect(addressFormatOf("us")).toMatchObject({
      lines: [["street"], ["city", "region", "postalCode"]],
      postalCodeLabel: "zip",
      regionLabel: "state",
    });
    expect(addressFormatOf("us").regions).toContainEqual(
      expect.objectContaining({ key: "CA", name: "California", zip: "9[0-5]|96[01]" }),
    );
    expect(addressFormatOf("jp")).toMatchObject({ regionLabel: "prefecture" });
    expect(addressFormatOf("jp").lines.flat()).toEqual(["postalCode", "region", "city", "street"]);
    expect(addressFormatOf("ca").regions).toContainEqual(
      expect.objectContaining({ key: "BC", aliases: ["Colombie-Britannique"] }),
    );
    expect(addressFormatOf(null)).toMatchObject({ countryCode: null, postalCode: null, regions: [] });
  });

  it("rejects a snapshot whose example does not match its postal code pattern", () => {
    const snapshot = readAddressMetadataSnapshot();
    const broken = {
      ...snapshot,
      entries: { ...snapshot.entries, "data/DE": { ...snapshot.entries["data/DE"], zipex: "2613" } },
    };
    expect(() => buildAddressMetadata(broken)).toThrow("DE: example 2613 does not match");
  });
});
