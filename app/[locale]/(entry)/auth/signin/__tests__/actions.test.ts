import { describe, expect, it, vi } from "vitest";

const providers = vi.hoisted(() => ({ google: false, microsoft: false }));

vi.mock("@/core/auth/better-auth", () => ({ enabledSocialProviders: providers }));
vi.mock("../sign-in-entry", () => ({
  resolveSignInEntry: () => Promise.resolve({ callbackURL: "/en/dashboard" }),
  searchParamsOf: () => ({}),
}));

import { resolveSignInEntryAction } from "../actions";

describe("sign-in entry action", () => {
  it("answers with the social providers the server has when asked, not the ones the prerender saw", async () => {
    expect((await resolveSignInEntryAction("")).socialProviders).toEqual({ google: false, microsoft: false });

    providers.google = true;
    providers.microsoft = true;

    expect(await resolveSignInEntryAction("?callbackURL=%2Fen%2Fdashboard")).toEqual({
      callbackURL: "/en/dashboard",
      socialProviders: { google: true, microsoft: true },
    });
  });
});
