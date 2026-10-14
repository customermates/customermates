import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { REPO_ROOT } from "./walk";

describe("currency picker catalog", () => {
  it("uses the shared searchable currency autocomplete on the field picker", () => {
    const customColumn = readFileSync(
      join(REPO_ROOT, "app/[locale]/(protected)/configure/components/field-modal.tsx"),
      "utf8",
    );
    const currencyAutocomplete = readFileSync(
      join(REPO_ROOT, "components/forms/form-autocomplete-currency.tsx"),
      "utf8",
    );

    expect(customColumn).toContain("<FormAutocompleteCurrency");
    expect(customColumn).toContain('id="currency"');
    expect(currencyAutocomplete).toContain("items={CURRENCIES}");
    expect(currencyAutocomplete).toContain("textValue: label");
  });
});
