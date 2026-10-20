import { describe, expect, it } from "vitest";

import { presetId } from "../crm-preset";
import { retiredStarterListTypeId } from "../retired-starter-list";
import { RECORD_PRESET_KEYS } from "../workspace-record-preset";

const companyId = "6f1c2c3e-7a0b-4b8e-9a51-2d1f0c9e4b11";

describe("retiredStarterListTypeId", () => {
  it("resolves every starter list of a pre-upgrade URL to the id the upgrade gave it", () => {
    for (const key of RECORD_PRESET_KEYS)
      expect(retiredStarterListTypeId(companyId, key)).toBe(presetId(companyId, key));
  });

  it("resolves nothing else", () => {
    expect(retiredStarterListTypeId(companyId, "lineItem")).toBeNull();
    expect(retiredStarterListTypeId(companyId, "people")).toBeNull();
  });
});
