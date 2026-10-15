import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next-intl", () => ({
  useLocale: () => "en",
  useTranslations: () => Object.assign((key: string) => key, { rich: (key: string) => key }),
}));
vi.mock("../footer-privacy-choices", () => ({ FooterPrivacyChoices: () => null }));
vi.mock("@/components/shared/app-link", () => ({
  AppLink: ({ children, href }: { children: ReactNode; href: string }) => createElement("a", { href }, children),
}));

import { FooterContent } from "../footer-content";

const BADGE_HOSTS = ["uneed.best", "b.sf-syn.com", "twelve.tools", "wired.business", "startupfa.me", "open-launch.com"];

function footerMarkup(appMode: "cloud" | "self-hosted") {
  return renderToStaticMarkup(createElement(FooterContent, { appMode }));
}

describe("FooterContent", () => {
  it("loads no third-party badge images on a self-hosted instance", () => {
    const markup = footerMarkup("self-hosted");

    for (const host of BADGE_HOSTS) expect(markup, host).not.toContain(host);
  });

  it("keeps the badges on cloud", () => {
    expect(footerMarkup("cloud")).toContain("uneed.best");
  });
});
