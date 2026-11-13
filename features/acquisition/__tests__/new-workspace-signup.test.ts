import { describe, expect, it } from "vitest";

import { emailDomain, isBusinessEmail } from "../business-email";
import { campaignSummary, isCompanySignup } from "../new-workspace-signup";

describe("business email", () => {
  it("treats free mail providers as private addresses", () => {
    expect(isBusinessEmail("jane@gmail.com")).toBe(false);
    expect(isBusinessEmail("jane@GMX.de")).toBe(false);
    expect(isBusinessEmail("jane@outlook.com")).toBe(false);
  });

  it("treats every other domain as a business address", () => {
    expect(isBusinessEmail("jane@acme.example")).toBe(true);
    expect(emailDomain("Jane@Acme.Example")).toBe("acme.example");
  });

  it("does not guess for a malformed address", () => {
    expect(isBusinessEmail("jane")).toBe(false);
    expect(isBusinessEmail("jane@")).toBe(false);
    expect(emailDomain("@acme.example")).toBeNull();
  });
});

describe("company signup", () => {
  it("needs a business address and a team above one person", () => {
    expect(isCompanySignup({ businessEmail: true, teamSize: "small" })).toBe(true);
    expect(isCompanySignup({ businessEmail: true, teamSize: "large" })).toBe(true);
    expect(isCompanySignup({ businessEmail: true, teamSize: "solo" })).toBe(false);
    expect(isCompanySignup({ businessEmail: true, teamSize: null })).toBe(false);
    expect(isCompanySignup({ businessEmail: false, teamSize: "medium" })).toBe(false);
  });

  it("summarizes the campaign for the operator mail", () => {
    expect(
      campaignSummary({ source: "google", medium: "cpc", campaign: "k1", content: null, term: "crm outlook" }),
    ).toBe("source google, medium cpc, campaign k1, term crm outlook");
    expect(campaignSummary(null)).toBeNull();
  });
});
