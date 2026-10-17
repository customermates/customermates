import { readFileSync } from "node:fs";

import { beforeEach, describe, expect, it, vi } from "vitest";

const mockEnv = vi.hoisted(() => ({ APP_MODE: "cloud" as "cloud" | "self-hosted", BASE_URL: "http://localhost:4000" }));

vi.mock("@/env", () => ({ env: mockEnv }));
vi.mock("@/app/root-document", () => ({ RootDocument: () => null }));
vi.mock("@/components/acquisition/public-ad-attribution-consent", () => ({
  PublicAdAttributionConsentCard: () => null,
}));

import { ROUTING_LOCALES } from "@/i18n/locale-registry";

import { generateStaticParams } from "../layout";

describe("locale pages rendered at build time", () => {
  beforeEach(() => {
    mockEnv.APP_MODE = "cloud";
  });

  it("prerenders every locale for cloud builds", () => {
    expect(generateStaticParams()).toEqual(ROUTING_LOCALES.map((locale) => ({ locale })));
  });

  it("leaves public pages to the first request on self-hosted builds, where BASE_URL is only known at runtime", () => {
    mockEnv.APP_MODE = "self-hosted";

    expect(generateStaticParams()).toEqual([]);
  });

  it.each(["(public)", "(protected)"])(
    "renders the %s pages on every request, which self-hosted builds no longer prerender",
    (group) => {
      const source = readFileSync(new URL(`../${group}/layout.tsx`, import.meta.url), "utf8");

      expect(source).toMatch(/^export const dynamic = "force-dynamic";$/m);
    },
  );
});
