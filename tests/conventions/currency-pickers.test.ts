import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { REPO_ROOT } from "./walk";

describe("currency picker catalog", () => {
  it("uses the shared searchable currency autocomplete on both picker surfaces", () => {
    const companySettings = readFileSync(
      join(REPO_ROOT, "app/[locale]/(protected)/company/components/company-settings/company-settings-form.tsx"),
      "utf8",
    );
    const customColumn = readFileSync(
      join(REPO_ROOT, "components/data-view/custom-columns/custom-column-modal.tsx"),
      "utf8",
    );
    const currencyAutocomplete = readFileSync(
      join(REPO_ROOT, "components/forms/form-autocomplete-currency.tsx"),
      "utf8",
    );

    expect(companySettings).toContain('<FormAutocompleteCurrency required id="currency" />');
    expect(customColumn).toContain("<FormAutocompleteCurrency");
    expect(customColumn).toContain('id="options.currency"');
    expect(currencyAutocomplete).toContain("items={CURRENCIES}");
    expect(currencyAutocomplete).toContain("textValue: label");
  });
});
