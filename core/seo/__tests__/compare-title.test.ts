import { describe, expect, it } from "vitest";

import { compareDisplayTitle } from "@/core/seo/compare-title";

const alternativeTitle = (competitor: string) => `Best ${competitor} alternative`;

describe("compareDisplayTitle", () => {
  it("names both products on a head-to-head page", () => {
    expect(compareDisplayTitle("hubspot-vs-salesforce", "HubSpot", "Salesforce", alternativeTitle)).toBe(
      "HubSpot vs Salesforce",
    );
  });

  it("falls back to the competitor when the second product is missing", () => {
    expect(compareDisplayTitle("hubspot-vs-salesforce", "HubSpot", undefined, alternativeTitle)).toBe("HubSpot");
  });

  it("uses the translated label on an alternative page", () => {
    expect(compareDisplayTitle("hubspot-alternative", "HubSpot", undefined, alternativeTitle)).toBe(
      "Best HubSpot alternative",
    );
  });

  it("leaves a plain review page as the competitor name", () => {
    expect(compareDisplayTitle("folk", "Folk", undefined, alternativeTitle)).toBe("Folk");
  });
});
