import { describe, expect, it, vi } from "vitest";

vi.mock("@/env", () => ({ env: { APP_MODE: "self-hosted", BASE_URL: "http://localhost:4000" } }));
vi.mock("next/navigation", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  redirect: (to: string) => {
    throw new Error(`NEXT_REDIRECT ${to}`);
  },
}));
vi.mock("next/headers", () => ({ headers: () => Promise.resolve(new Headers({ "x-cm-workspace": "acme" })) }));
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
    ["Billing", () => import("../settings/(workspace)/billing/page"), { searchParams }],
  ] as const)(
    "send %s to the Dashboard in the locale of the request",
    async (_page, load, props) => {
      const { default: Page } = (await load()) as { default: (props?: unknown) => Promise<unknown> };

      await expect(Page(props)).rejects.toThrow("NEXT_REDIRECT /de/w/acme/dashboard");
    },
    60_000,
  );

  it("send Channels to the AI apps on the Connections page, since the inbox part is cloud-only", async () => {
    const { default: Page } = (await import("../settings/(account)/channels/page")) as {
      default: (props?: unknown) => Promise<unknown>;
    };

    await expect(Page({ searchParams })).rejects.toThrow("NEXT_REDIRECT /de/w/acme/settings/connections?section=apps");
  }, 60_000);

  it("send Routines to Automations, the page that replaced it and explains itself on self-hosted", async () => {
    const { default: Page } = (await import("../routines/page")) as { default: (props?: unknown) => Promise<unknown> };

    await expect(Page({ searchParams })).rejects.toThrow("NEXT_REDIRECT /de/w/acme/automations?kind=routine");
  }, 60_000);
});
