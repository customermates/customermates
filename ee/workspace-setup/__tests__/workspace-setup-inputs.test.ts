import { describe, expect, it } from "vitest";

import { setupCompanySettings } from "../workspace-setup-inputs";

describe("company settings from the company answers", () => {
  it("maps the confirmed country and language onto the settings and ignores what it cannot apply", () => {
    const answer = (value: string) => ({
      source: "user" as const,
      confidence: 1,
      value: { format: "singleChoice" as const, value },
    });
    expect(setupCompanySettings({ country: answer("CH"), language: answer("fr") })).toEqual({
      country: "ch",
      formattingLocale: "fr",
    });
    expect(setupCompanySettings({ country: answer("XX"), language: answer("pt") })).toEqual({});
    expect(setupCompanySettings({})).toEqual({});
  });
});
