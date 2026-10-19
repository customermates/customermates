import { describe, expect, it } from "vitest";

import { setupCompanySettings } from "../workspace-setup-inputs";

describe("company settings from the company answers", () => {
  it("maps the confirmed language onto the formatting settings and never stores a country", () => {
    const answer = (value: string) => ({
      source: "user" as const,
      confidence: 1,
      value: { format: "singleChoice" as const, value },
    });
    expect(setupCompanySettings({ country: answer("CH"), language: answer("fr") })).toEqual({ formattingLocale: "fr" });
    expect(setupCompanySettings({ country: answer("XX"), language: answer("pt") })).toEqual({});
    expect(setupCompanySettings({})).toEqual({});
  });
});
