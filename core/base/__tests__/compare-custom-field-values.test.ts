import { describe, expect, it } from "vitest";

import { compareCustomFieldValues } from "../base-query-builder";

describe("compareCustomFieldValues", () => {
  const de = new Intl.Collator("de-DE");
  const en = new Intl.Collator("en-US");
  const fr = new Intl.Collator("fr-FR");

  it("uses the explicit formatting locale for string collation", () => {
    expect(compareCustomFieldValues("ä", "z", "asc", "plain", de)).toBeLessThan(0);
    expect(compareCustomFieldValues("ä", "z", "desc", "plain", de)).toBeGreaterThan(0);
  });

  it("keeps missing values last in both directions", () => {
    expect(compareCustomFieldValues(null, "value", "asc", "plain", en)).toBeGreaterThan(0);
    expect(compareCustomFieldValues(null, "value", "desc", "plain", en)).toBeGreaterThan(0);
  });

  it("sorts numeric and date values independently of locale", () => {
    expect(compareCustomFieldValues("2", "10", "asc", "currency", de)).toBeLessThan(0);
    expect(compareCustomFieldValues("2025-01-01", "2026-01-01", "asc", "date", fr)).toBeLessThan(0);
  });
});
