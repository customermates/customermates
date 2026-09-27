import type { ReactNode } from "react";

import { renderToStaticMarkup } from "react-dom/server";
import { jsx } from "react/jsx-runtime";
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  env: { APP_MODE: "cloud", VERCEL_ENV: undefined as string | undefined },
}));

vi.mock("@/env", () => ({ env: state.env }));
vi.mock("@vercel/analytics/next", () => ({
  Analytics: () => jsx("script", { src: "/_vercel/insights/script.js" }),
}));
vi.mock("@/components/ui/sonner", () => ({ Toaster: () => null }));
vi.mock("@/features/auth/next/resolve-account-state", () => ({
  resolveRequestAccountState: () => Promise.resolve({ state: "unauthenticated", user: null }),
}));
vi.mock("@/app/components/navigation/marketing-shell", () => ({
  MarketingShell: ({ children }: { children: ReactNode }) => children,
}));
vi.mock("next/navigation", () => ({
  notFound: (): never => {
    throw new Error("NEXT_HTTP_ERROR_FALLBACK;404");
  },
}));

import StaticLayout from "../layout";

async function render() {
  const element = await StaticLayout({
    children: jsx("main", { children: "docs page" }),
    params: Promise.resolve({ locale: "en" }),
  });
  return renderToStaticMarkup(element);
}

beforeEach(() => {
  state.env.APP_MODE = "cloud";
  state.env.VERCEL_ENV = undefined;
});

describe("StaticLayout scripts", () => {
  it("requests Vercel's insights script only on a Vercel deployment of the cloud app", async () => {
    state.env.VERCEL_ENV = "production";

    expect(await render()).toContain("/_vercel/insights/script.js");
  });

  it("does not request the insights script from a cloud build served outside Vercel", async () => {
    const html = await render();

    expect(html).toContain("docs page");
    expect(html).not.toContain("/_vercel/insights/script.js");
    expect(html).toContain("https://lmsqueezy.com/affiliate.js");
  });

  it("requests neither cloud script on a self-hosted instance", async () => {
    state.env.APP_MODE = "self-hosted";
    state.env.VERCEL_ENV = "production";
    const html = await render();

    expect(html).not.toContain("/_vercel/insights/script.js");
    expect(html).not.toContain("lmsqueezy");
  });
});
