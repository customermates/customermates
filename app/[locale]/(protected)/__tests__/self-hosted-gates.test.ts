import { describe, expect, it, vi } from "vitest";

vi.mock("@/env", () => ({ env: { APP_MODE: "self-hosted", BASE_URL: "http://localhost:4000" } }));
vi.mock("next/navigation", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  redirect: (to: string) => {
    throw new Error(`NEXT_REDIRECT ${to}`);
  },
}));
vi.mock("next-intl/server", () => ({
  getLocale: () => Promise.resolve("de"),
  getTranslations: () => Promise.resolve((key: string) => key),
}));
vi.mock("@/features/auth/next/require", () => ({ requireAccess: () => Promise.resolve() }));
vi.mock("@/core/di", () => ({}));

const searchParams = Promise.resolve({});

describe("cloud-only pages on a self-hosted instance", () => {
  it.each([
    ["Inbox", () => import("../inbox/page"), { searchParams }],
    ["Routines", () => import("../routines/page"), { searchParams }],
    ["Billing", () => import("../settings/(workspace)/billing/page"), undefined],
    ["Channels", () => import("../settings/(account)/channels/page"), undefined],
  ] as const)(
    "send %s to the Dashboard in the locale of the request",
    async (_page, load, props) => {
      const { default: Page } = (await load()) as { default: (props?: unknown) => Promise<unknown> };

      await expect(Page(props)).rejects.toThrow("NEXT_REDIRECT /de/dashboard");
    },
    60_000,
  );
});
