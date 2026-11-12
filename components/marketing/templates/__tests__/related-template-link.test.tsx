import type { ReactNode } from "react";

import { createTranslator } from "next-intl";
import { beforeEach, describe, expect, it, vi } from "vitest";

import en from "@/i18n/locales/en.json";
import rawIndex from "@/core/templates/bundles/index.json";
import type { TemplateIndex } from "@/core/templates/template-index.types";

import { renderAsync } from "./render-async";

const BASELINE = rawIndex as unknown as TemplateIndex;
const state = vi.hoisted(() => ({ index: [] as unknown[] }));

vi.mock("next-intl/server", () => ({
  getLocale: () => Promise.resolve("en"),
  getTranslations: (namespace?: string) =>
    Promise.resolve(createTranslator({ locale: "en", messages: en, namespace } as never)),
}));
vi.mock("@/core/templates/template-index", () => ({
  getTemplateIndex: () => state.index,
  getTemplateIndexEntry: (slug: string) => (state.index as { slug: string }[]).find((entry) => entry.slug === slug),
}));
vi.mock("@/core/capabilities/capabilities", () => ({
  CAPABILITIES: ["forms", "rules", "calendarWrite", "notifications", "incomingWebhooks"],
  SHIPPED_CAPABILITIES: new Set(["forms", "rules", "calendarWrite", "notifications", "incomingWebhooks"]),
}));
vi.mock("@/core/templates/template-deployment", () => ({ pagePublicationOptions: () => ({ deployment: "cloud" }) }));
vi.mock("@/components/shared/app-link", () => ({
  AppLink: ({ children, href }: { children: ReactNode; href: string }) => <a href={href}>{children}</a>,
}));
vi.mock("@/core/fumadocs/source", () => ({
  blogPostsSource: { getPage: () => undefined },
  comparePagesSource: { getPage: () => undefined },
  docsSource: { getPage: () => undefined },
  featurePagesSource: { getPage: () => undefined },
  forPagesSource: { getPage: () => undefined },
}));

import { RelatedPage } from "../../related-pages";

function publish(slug: string, publicPage: "own" | "proof") {
  return BASELINE.map((entry) =>
    entry.slug === slug
      ? {
          ...entry,
          locales: { ...entry.locales, en: { ...entry.locales.en, publicPage, status: "published" as const } },
        }
      : entry,
  );
}

beforeEach(() => {
  state.index = [...BASELINE];
});

describe("a related link to a template page", () => {
  it("shows the template name, its search description and the templates label", async () => {
    state.index = publish("client-tracker", "own");

    const html = await renderAsync(await RelatedPage({ href: "/templates/client-tracker" }));

    expect(html).toContain('href="/templates/client-tracker"');
    expect(html).toContain("Client tracker");
    expect(html).toContain("Templates");
  });

  it("fails the build for a template that is still a draft", async () => {
    await expect(RelatedPage({ href: "/templates/client-tracker" })).rejects.toThrow(
      "resolves to no published page in en",
    );
  });

  it("does not link a proof page that is kept out of search", async () => {
    state.index = publish("client-tracker", "proof");

    await expect(RelatedPage({ href: "/templates/client-tracker" })).rejects.toThrow(
      "resolves to no published page in en",
    );
  });
});
