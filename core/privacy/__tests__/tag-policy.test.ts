import { describe, expect, it } from "vitest";

import { consentTagPolicy } from "../tag-policy";

const accepted = {
  advertising: false,
  analytics: true,
  decidedAt: "2026-08-26T10:00:00.000Z",
  version: 1,
} as const;

describe("consent tag policy", () => {
  it("blocks every optional tag before a decision and after rejection", () => {
    expect(consentTagPolicy(null, "cloud")).toEqual({
      analytics: false,
    });
    expect(consentTagPolicy({ ...accepted, analytics: false }, "cloud")).toEqual({
      analytics: false,
    });
  });

  it("initializes analytics only after that category is accepted", () => {
    expect(consentTagPolicy(accepted, "cloud")).toEqual({
      analytics: true,
    });
    expect(consentTagPolicy({ ...accepted, analytics: false }, "cloud")).toEqual({
      analytics: false,
    });
  });

  it("never loads managed optional tags in self-hosted mode", () => {
    expect(consentTagPolicy(accepted, "self-hosted")).toEqual({
      analytics: false,
    });
  });
});
