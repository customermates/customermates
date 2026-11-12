import type { ReactNode } from "react";

import { createTranslator } from "next-intl";
import { beforeEach, describe, expect, it, vi } from "vitest";

import en from "@/i18n/locales/en.json";
import rawIndex from "@/core/templates/bundles/index.json";
import type { TemplateIndex } from "@/core/templates/template-index.types";

const BASELINE = rawIndex as unknown as TemplateIndex;

import { renderAsync } from "./render-async";

const state = vi.hoisted(() => ({ index: [] as unknown[] }));

vi.mock("next/navigation", () => ({
  notFound: (): never => {
    throw new Error("NEXT_HTTP_ERROR_FALLBACK;404");
  },
}));
vi.mock("next-intl/server", () => ({
  getLocale: () => Promise.resolve("en"),
  getTranslations: (argument: string | { namespace: string }) =>
    Promise.resolve(
      createTranslator({
        locale: "en",
        messages: en,
        namespace: typeof argument === "string" ? argument : argument.namespace,
      } as never),
    ),
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
vi.mock("@/app/components/footer", () => ({ Footer: () => null }));
vi.mock("@/components/shared/app-link", () => ({
  AppLink: ({ children, href }: { children: ReactNode; href: string }) => <a href={href}>{children}</a>,
}));
vi.mock("@/components/chip/app-chip", () => ({
  AppChip: ({ children }: { children: ReactNode }) => <span data-chip="">{children}</span>,
}));
vi.mock("@/components/marketing/page-updated-at", () => ({ PageUpdatedAt: () => null }));
vi.mock("@/components/marketing/product-demo", () => ({ buildProductDemoUrl: () => "https://demo.example/dashboard" }));
vi.mock("@/core/fumadocs/source", () => ({
  featurePagesSource: {
    getPage: ([slug]: string[]) =>
      slug === "contact-management" ? { data: { featureName: "Contact management" } } : undefined,
  },
  forPagesSource: {
    getPage: ([slug]: string[]) => (slug === "real-estate" ? { data: { industryName: "Real estate" } } : undefined),
  },
}));
vi.mock("../template-copy-prompt", () => ({
  TemplateCopyPrompt: ({ cloudPrompt, selfHostedPrompt }: { cloudPrompt: string; selfHostedPrompt: string }) => (
    <div>
      <pre data-prompt="cloud">{cloudPrompt}</pre>

      <pre data-prompt="selfHosted">{selfHostedPrompt}</pre>
    </div>
  ),
}));
vi.mock("../template-copy-button", () => ({
  TemplateCopyButton: ({ label, value }: { label: string; value: string }) => (
    <button data-copy={value.split("\n")[0]}>{label}</button>
  ),
}));
vi.mock("../template-gallery", () => ({
  TemplateGallery: ({ items }: { items: { slug: string; name: string; href: string }[] }) => (
    <ul data-gallery="">
      {items.map((item) => (
        <li key={item.slug} data-slug={item.slug}>
          <a href={item.href}>{item.name}</a>
        </li>
      ))}
    </ul>
  ),
}));

import { SwitchKit } from "../switch-kit";
import { TemplateDetail } from "../template-detail";
import { TemplateProofBlock } from "../template-proof-block";
import { TemplatesHub } from "../template-hub";

function publish(slug: string, locale: string, publicPage: "own" | "proof" | "none", index: TemplateIndex = BASELINE) {
  return index.map((entry) =>
    entry.slug === slug
      ? {
          ...entry,
          locales: {
            ...entry.locales,
            [locale]: { ...entry.locales[locale], publicPage, status: "published" as const },
          },
        }
      : entry,
  );
}

beforeEach(() => {
  state.index = [...BASELINE];
});

describe("the templates hub", () => {
  it("answers 404 while every template is a draft", async () => {
    await expect(TemplatesHub({ locale: "en" })).rejects.toThrow("NEXT_HTTP_ERROR_FALLBACK;404");
  });

  it("lists own and proof pages, with the headline, the trial hint and the structured data", async () => {
    state.index = publish("sales-pipeline", "en", "proof", publish("client-tracker", "en", "own"));

    const html = await renderAsync(await TemplatesHub({ locale: "en" }));

    expect(html).toContain("Paste a template.");
    expect(html).toContain("Your AI agent builds the CRM.");
    expect(html).toContain('data-slug="client-tracker"');
    expect(html).toContain('href="/templates/client-tracker"');
    expect(html).toContain('data-slug="sales-pipeline"');
    expect(html).not.toContain('data-slug="real-estate-pipeline"');
    expect(html).toContain('"@type":"ItemList"');
    expect(html).toContain('"@type":"BreadcrumbList"');
    expect(html).toContain("/auth/signup");
  });
});

describe("a template page", () => {
  beforeEach(() => {
    state.index = publish("client-tracker", "en", "own");
  });

  async function detail(slug = "client-tracker", visibility: "own" | "proof" = "own") {
    return renderAsync(await TemplateDetail({ locale: "en", slug, visibility }));
  }

  it("answers the job in the headline and the first paragraph", async () => {
    const html = await detail();

    expect(html).toContain("<h1");
    expect(html).toContain("A client tracker your AI agent builds in your CRM");
    expect(html).toContain("A client tracker is a short list with one row per client");
  });

  it("makes the free trial with the template the primary call to action", async () => {
    expect(await detail()).toContain('href="/auth/signup?template=client-tracker"');
  });

  it("shows the three steps, the cloud and self-hosted prompts and the honest limits", async () => {
    const html = await detail();

    expect(html).toContain("Get a workspace");
    expect(html).toContain("Paste the prompt into your AI agent");
    expect(html).toContain("Approve the plan");
    expect(html).toContain('data-prompt="cloud"');
    expect(html).toContain("/auth/signup?template=client-tracker");
    expect(html).toContain('data-prompt="selfHosted"');
    expect(html).toContain("It is not an invoicing, quoting or time-tracking tool.");
  });

  it("shows what the template creates, the routine, the knowledge pages and the follow-up rules", async () => {
    const html = await detail();

    expect(html).toContain('data-template-list="clients"');
    expect(html).toContain('data-template-stage="clients.status"');
    expect(html).toContain("The weekly 15-minute client review");
    expect(html).toContain("Client tracker playbook");
    expect(html).toContain('data-template-rules=""');
    expect(html).toContain("Tell the owner that an Action is overdue");
  });

  it("lists the sources with their checked-on date and links the paired page", async () => {
    const html = await detail();

    expect(html).toContain("capsulecrm.com");
    expect(html).toContain("Checked on");
    expect(html).toContain('href="/features/contact-management"');
  });

  it("emits an FAQ with FAQPage structured data and a WebPage entry", async () => {
    const html = await detail();

    expect(html).toContain("What belongs in a client tracker?");
    expect(html).toContain('"@type":"FAQPage"');
    expect(html).toContain('"@type":"WebPage"');
    expect(html).toContain('"dateModified":"2026-11-12T00:00:00.000Z"');
  });

  it("emits no HowTo data, which Google no longer documents or shows", async () => {
    expect(await detail()).not.toContain('"@type":"HowTo"');
  });

  it("offers no related templates on a proof page", async () => {
    state.index = publish("sales-pipeline", "en", "proof", publish("client-tracker", "en", "own"));

    expect(await detail("sales-pipeline", "proof")).not.toContain('id="related"');
  });

  it("answers 404 for a locale without page text", async () => {
    await expect(TemplateDetail({ locale: "pl", slug: "client-tracker", visibility: "own" })).rejects.toThrow(
      "NEXT_HTTP_ERROR_FALLBACK;404",
    );
  });
});

describe("the proof block", () => {
  it("renders nothing while the paired template is a draft", async () => {
    expect(await renderAsync(await TemplateProofBlock({ locale: "en", path: "/features/contact-management" }))).toBe(
      "",
    );
  });

  it("shows the template, what it sets up, a copy button and a link to its page", async () => {
    state.index = publish("client-tracker", "en", "own");

    const html = await renderAsync(await TemplateProofBlock({ locale: "en", path: "/features/contact-management" }));

    expect(html).toContain("Start from a ready-made template");
    expect(html).toContain("Client tracker");
    expect(html).toContain("Sets up");
    expect(html).toContain("Clients, Contacts, Actions");
    expect(html).toContain('data-copy="# Client tracker"');
    expect(html).toContain('href="/templates/client-tracker"');
  });

  it("leaves out the link where the template has no page of its own", async () => {
    state.index = publish("client-tracker", "en", "none");

    const html = await renderAsync(await TemplateProofBlock({ locale: "en", path: "/features/contact-management" }));

    expect(html).toContain('data-template-proof-card="client-tracker"');
    expect(html).not.toContain('href="/templates/client-tracker"');
  });

  it("renders nothing for a page that no template names", async () => {
    state.index = publish("client-tracker", "en", "own");

    expect(await renderAsync(await TemplateProofBlock({ locale: "en", path: "/for/recruiting" }))).toBe("");
  });
});

describe("the switch kit", () => {
  it("shows what moves, how to export and what does not travel for a tool", async () => {
    const html = await renderAsync(await SwitchKit({ tool: "notion" }));

    expect(html).toContain("Switch kit: Notion");
    expect(html).toContain("What moves");
    expect(html).toContain("Open the database, choose the three-dot menu");
    expect(html).toContain("What does not travel");
    expect(html).toContain("Export steps checked on");
  });

  it("rejects a tool it has no copy for", async () => {
    await expect(SwitchKit({ tool: "excel-sheet" })).rejects.toThrow("Unknown switch kit tool");
  });
});
