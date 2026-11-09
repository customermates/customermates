import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

const intl = vi.hoisted(() => ({ locale: "en" }));

vi.mock("next-intl", () => ({
  useLocale: () => intl.locale,
}));

vi.mock("@/components/shared/app-link", () => ({
  AppLink: ({ children, href }: { children: React.ReactNode; href: string }) => <a href={href}>{children}</a>,
}));

import { HOMEPAGE_CAPTURES } from "@/app/[locale]/(static)/components/homepage-captures";
import { USE_CASE_VISUALS, type UseCaseVisual } from "@/core/fumadocs/schemas/use-cases";
import { ASSET_LOCALES } from "@/i18n/locale-registry";

import {
  CAPTURED_USE_CASE_CROPS,
  CONVERSATION_CROPS,
  UseCaseCapture,
  type UseCaseChannel,
  hasUseCaseCapture,
  conversationChannel,
} from "../use-case-capture";
import { UseCasesSection } from "../use-cases-section";

const CONTENT_ROOT = join(process.cwd(), "content");

function render(kind: UseCaseVisual, locale = "en", channel?: UseCaseChannel) {
  intl.locale = locale;

  return renderToStaticMarkup(<UseCaseCapture channel={channel} kind={kind} />);
}

function conversationCards() {
  const cards: Array<{ description: string; file: string; href: string; title: string }> = [];

  for (const file of contentFiles(CONTENT_ROOT)) {
    const text = readFileSync(file, "utf8");

    for (const match of text.matchAll(
      /- title: "?(.*?)"?\n\s+description: "?(.*?)"?\n\s+href: (\S+)\n\s+linkLabel: "?.*?"?\n\s+visual: conversation\b/gu,
    ))
      cards.push({ description: match[2], file, href: match[3], title: match[1] });
  }

  return cards;
}

function contentFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory()
      ? contentFiles(join(directory, entry.name))
      : entry.name.endsWith(".mdx")
        ? [join(directory, entry.name)]
        : [],
  );
}

function visualsUsedInContent() {
  const used = new Map<string, string[]>();

  for (const file of contentFiles(CONTENT_ROOT)) {
    for (const match of readFileSync(file, "utf8").matchAll(/^\s+visual:\s*"?([a-z]+)"?\s*$/gmu))
      used.set(match[1], [...(used.get(match[1]) ?? []), file]);
  }

  return used;
}

describe("UseCaseCapture", () => {
  it("has a product capture for every use-case visual", () => {
    expect(USE_CASE_VISUALS.filter(hasUseCaseCapture)).toEqual([...USE_CASE_VISUALS]);
    expect(Object.keys(CAPTURED_USE_CASE_CROPS).sort()).toEqual([...USE_CASE_VISUALS].sort());
  });

  it("covers every visual kind that the content uses", () => {
    const used = visualsUsedInContent();

    expect([...used.keys()].sort()).toEqual(expect.arrayContaining(["agent", "dashboard", "pipeline", "team"]));

    for (const [kind, files] of used)
      expect(hasUseCaseCapture(kind as UseCaseVisual), `${kind} in ${files[0]}`).toBe(true);
  });

  it("renders a hidden, lazy light and dark capture of the real product in an app window", () => {
    for (const kind of USE_CASE_VISUALS) {
      const html = render(kind);

      expect(html, kind).toContain('aria-hidden="true"');
      expect(html, kind).toContain(`data-use-case-visual="${kind}"`);
      expect(html, kind).toContain("mk-usecase-window");
      const captures = html.match(/<img\b[^>]*data-use-case-capture[^>]*>/gu) ?? [];

      expect(captures, kind).toHaveLength(2);
      for (const image of captures) {
        expect(image, kind).toContain('loading="lazy"');
        expect(image, kind).toContain('alt=""');
      }
      expect(html, kind).toContain('class="dark:hidden"');
      expect(html, kind).toContain('class="not-dark:hidden"');
      expect(html, kind).toMatch(/srcSet="[^"]*captures%2Flight%2F/u);
      expect(html, kind).toMatch(/srcSet="[^"]*captures%2Fdark%2F/u);
      expect(html, kind).not.toContain("fetchPriority");
    }
  });

  it("marks a conversation card with the channel it is about and no other card with a channel", () => {
    expect(render("conversation", "en", "linkedin")).toContain('alt="LinkedIn"');
    expect(render("conversation", "en", "linkedin")).toContain("homepage-usecase-draft-en.png");
    expect(render("conversation", "en", "whatsapp")).toContain('alt="WhatsApp"');
    expect(render("conversation", "en", "whatsapp")).not.toContain('alt="LinkedIn"');
    expect(render("conversation", "en", "whatsapp")).toContain("homepage-usecase-whatsapp-en.png");
    expect(render("conversation", "en", "email")).not.toMatch(/alt="(LinkedIn|WhatsApp|Gmail)"/u);
    expect(render("conversation")).not.toMatch(/alt="(LinkedIn|WhatsApp|Gmail)"/u);
    for (const kind of USE_CASE_VISUALS.filter((visual) => visual !== "conversation"))
      expect(render(kind, "en", "linkedin"), kind).not.toMatch(/alt="(LinkedIn|WhatsApp|Gmail)"/u);
  });

  it("reads the channel of a card from its title, description and link", () => {
    const card = {
      description: "Threads sit on the client.",
      href: "/features/unified-inbox",
      title: "Replies drafted",
    };

    expect(conversationChannel(card)).toBe("email");
    expect(conversationChannel({ ...card, href: "/features/linkedin-integration" })).toBe("linkedin");
    expect(conversationChannel({ ...card, title: "Follow up on LinkedIn conversations" })).toBe("linkedin");
    expect(
      conversationChannel({ ...card, description: "Email, LinkedIn and WhatsApp threads sit on the client." }),
    ).toBe("linkedin");
    expect(conversationChannel({ ...card, href: "/features/whatsapp-integration" })).toBe("whatsapp");
    expect(conversationChannel({ ...card, title: "Email and WhatsApp on the record" })).toBe("whatsapp");
  });

  it("gives every conversation card of the content a thread of its own channel", () => {
    const cards = conversationCards();
    const channels = new Set(cards.map((card) => conversationChannel(card)));

    expect(cards.length).toBeGreaterThan(30);
    expect(channels.has("linkedin")).toBe(true);
    expect(channels.has("whatsapp")).toBe(true);

    for (const card of cards) {
      const text = `${card.title} ${card.description} ${card.href}`.toLowerCase();
      const channel = conversationChannel(card);

      expect(channel === "linkedin", card.file + card.title).toBe(text.includes("linkedin"));
      expect(channel === "whatsapp", card.file + card.title).toBe(
        !text.includes("linkedin") && text.includes("whatsapp"),
      );
    }
  });

  it("picks the capture by the asset locale, with French on the English assets", () => {
    expect(render("dashboard", "de")).toContain("homepage-dashboard-de.png");
    expect(render("dashboard", "en")).toContain("homepage-dashboard-en.png");
    expect(render("dashboard", "fr")).toContain("homepage-dashboard-en.png");
    expect(render("conversation", "de")).toContain("homepage-usecase-draft-de.png");
    expect(render("agent", "fr")).toContain("homepage-usecase-connect-en.png");
    expect(render("team", "de")).toContain("homepage-usecase-team-de.png");
    expect(render("conversation", "de", "whatsapp")).toContain("homepage-usecase-whatsapp-de.png");
    expect(render("conversation", "fr", "whatsapp")).toContain("homepage-usecase-whatsapp-en.png");
    expect(render("search", "fr")).toContain("homepage-usecase-search-en.png");
    expect(render("import", "de")).toContain("homepage-usecase-import-de.png");
  });

  it("never asks for more than the capture holds, so no crop shows an empty edge", () => {
    for (const [kind, crops] of [
      ...Object.entries(CAPTURED_USE_CASE_CROPS),
      ...Object.entries(CONVERSATION_CROPS).map(([channel, crops]) => [`conversation ${channel}`, crops] as const),
    ]) {
      for (const locale of ASSET_LOCALES) {
        const crop = crops[locale];
        const size = HOMEPAGE_CAPTURES[crop.capture][locale];

        expect(crop.x + crop.width, `${kind} ${locale} right edge`).toBeLessThanOrEqual(size.width);
        expect(crop.y, `${kind} ${locale} top edge`).toBeLessThan(size.height);
        expect(crop.x, `${kind} ${locale} left edge`).toBeGreaterThanOrEqual(0);
        expect(crop.y, `${kind} ${locale} top`).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it("keeps a crop tall enough to fill its card with the product, so no card shows an empty window", () => {
    for (const [kind, crops] of [
      ...Object.entries(CAPTURED_USE_CASE_CROPS),
      ...Object.entries(CONVERSATION_CROPS).map(([channel, crops]) => [`conversation ${channel}`, crops] as const),
    ]) {
      for (const locale of ASSET_LOCALES) {
        const crop = crops[locale];
        const size = HOMEPAGE_CAPTURES[crop.capture][locale];

        expect((size.height - crop.y) / crop.width, `${kind} ${locale} visible height`).toBeGreaterThanOrEqual(0.58);
      }
    }
  });

  it("gives every card of a section its own product crop, whatever mix of kinds and channels the page uses", () => {
    intl.locale = "en";
    const items = [
      { href: "/pipeline", title: "Pipeline title", visual: "pipeline" },
      { href: "/features/whatsapp-integration", title: "Email and WhatsApp on the record", visual: "conversation" },
      { href: "/features/linkedin-integration", title: "Follow up on LinkedIn", visual: "conversation" },
      { href: "/features/unified-inbox", title: "Answer from the thread", visual: "conversation" },
    ].map((item) => ({ ...item, description: `${item.title} description`, linkLabel: `${item.title} link` }));
    const html = renderToStaticMarkup(
      <UseCasesSection useCases={{ eyebrow: "Ways", items: items as never, title: "Four jobs. One workspace." }} />,
    );

    expect(html.match(/mk-usecase-window/gu)).toHaveLength(4);
    expect(html).not.toContain("mk-usecase-stage");
    expect(html).toContain('data-use-case-visual="pipeline"');
    expect(html.match(/data-use-case-channel="whatsapp"/gu)).toHaveLength(1);
    expect(html.match(/data-use-case-channel="linkedin"/gu)).toHaveLength(1);
    expect(html.match(/data-use-case-channel="email"/gu)).toHaveLength(1);
    expect(html.match(/alt="WhatsApp"/gu)).toHaveLength(1);
    expect(html.match(/alt="LinkedIn"/gu)).toHaveLength(1);
  });
});
