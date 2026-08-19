import { describe, expect, it } from "vitest";

import { DealDtoSchema } from "@/features/deals/deal.schema";

import { dealSeedSelect } from "../seeds/deal-select";

const requiredDtoKeys = Object.entries(DealDtoSchema.shape)
  .filter(([, schema]) => !schema.safeParse(undefined).success)
  .map(([key]) => key);

describe("dealSeedSelect", () => {
  it("selects every field DealDtoSchema requires", () => {
    const selected = new Set(Object.keys(dealSeedSelect));
    const missing = requiredDtoKeys.filter((key) => !selected.has(key));

    expect(missing).toEqual([]);
  });

  it("selects weightedValue, which the seeds parse through DealDtoSchema", () => {
    expect(dealSeedSelect.weightedValue).toBe(true);
    expect(requiredDtoKeys).toContain("weightedValue");
  });
});
