import { readFileSync } from "node:fs";
import { join } from "node:path";

import tailwindcss from "@tailwindcss/postcss";
import postcss, { type AcceptedPlugin } from "postcss";
import { createElement, Fragment } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { STYLEGUIDE_CHAPTERS } from "@/app/[locale]/(static)/styleguide/components/styleguide-chapters";
import {
  FeaturePagePilotVisual,
  validateFeaturePagePilotVisualBrief,
} from "@/components/marketing/feature-page-pilot-visual";
import {
  FEATURE_VISUAL_PILOT_REGISTRY,
  FEATURE_VISUAL_PILOT_SLUGS,
  getFeatureVisualPilot,
  type FeatureVisualPilotSource,
  type FeatureVisualPilotSlug,
} from "@/components/marketing/feature-visual-pilots";
import { MarketingSection } from "@/components/marketing/marketing-section";
import { resolveMarketingImageTheme } from "@/components/marketing/marketing-tone-context";
import {
  PersonIdentity,
  ProviderIdentity,
} from "@/components/marketing/visuals/native-visual-primitives";
import {
  VISUAL_REFERENCE_SYSTEM_VERSION,
  validateVisualBrief,
  visualSourceChecksum,
} from "@/components/marketing/visuals/visual-contract";
import { CONTENT_LOCALES, type ContentLocale } from "@/i18n/locale-registry";

import { REPO_ROOT } from "./walk";

const PILOT_SOURCES: Record<
  FeatureVisualPilotSlug,
  Record<ContentLocale, FeatureVisualPilotSource>
> = {
  "email-integration": {
    de: {
      featureName: "E-Mail-Integration",
      hero: {
        description:
          "Verbinden Sie unterstützte Gmail-, Outlook- und IMAP-Konten mit Customermates. Passende Konversationen stehen im gemeinsamen Postfach neben LinkedIn, WhatsApp, Instagram und Telegram bereit. Unterstützte externe KI-Clients können über MCP Kontext lesen, entwerfen und senden; Kampagnen und Sequenzen laufen in einem separaten Anbieter oder einer eigenen n8n-Instanz.",
        title:
          "E-Mail-Integration, die jede Konversation mit Ihrem CRM verbindet",
      },
      visualSection: {
        description:
          "Sieben unterstützte Kanäle umgeben Anna Müllers Datensatz. Ein Gmail-Thread ist hervorgehoben; die übrigen Anbieter bleiben ruhig.",
        labels: {
          focal: "Kundendatensatz",
          semantic: ["Konversation", "Zugeordnet"],
        },
        title: "Unterstützte Kanäle treffen in einem Kundenkontext zusammen",
      },
    },
    en: {
      featureName: "Email Integration",
      hero: {
        description:
          "Connect supported Gmail, Outlook, and IMAP accounts with Customermates. Matching conversations appear in the unified inbox alongside LinkedIn, WhatsApp, Instagram, and Telegram. Supported external AI clients can read context, draft, and send through MCP; sequences require separate n8n and delivery providers.",
        title: "Email Integration That Connects Every Conversation to Your CRM",
      },
      visualSection: {
        description:
          "Seven supported channels surround Anna Müller's record. One Gmail thread is highlighted while the other providers stay quiet.",
        labels: {
          focal: "Customer record",
          semantic: ["Conversation", "Associated"],
        },
        title: "Supported channels meet in one customer context",
      },
    },
  },
  pipeline: {
    de: {
      featureName: "Vertriebspipeline",
      hero: {
        description:
          "Visualisieren Sie Ihre gesamte Pipeline mit Drag-and-Drop Kanban-Boards. Unterstützte externe KI-Clients können zulässige Deal-Felder über MCP aktualisieren; Client und Modell bleiben separat. Stellen Sie aktuelle Pipeline-Werte in persönlichen Dashboards dar und erkennen Sie Engpässe früh.",
        title:
          "Eine Vertriebspipeline, die Ihnen genau zeigt, wo jeder Deal steht",
      },
      visualSection: {
        description:
          "Max Bergmann zieht Digital Customer Platform von Offen in Richtung Gewonnen, während Dealwert und gewichteter Wert sichtbar bleiben.",
        labels: {
          focal: "Deal",
          semantic: ["Dealwert", "Gewichteter Wert"],
        },
        title: "Einen Deal verschieben, ohne die Werte zu verlieren",
      },
    },
    en: {
      featureName: "Sales Pipeline",
      hero: {
        description:
          "Visualize your entire pipeline with drag-and-drop kanban boards. Supported external AI clients can update permitted deal fields through MCP, while the client and model remain separate. Chart current pipeline values on personal dashboards and spot bottlenecks early.",
        title:
          "A Sales Pipeline That Shows You Exactly Where Every Deal Stands",
      },
      visualSection: {
        description:
          "Max Bergmann drags Digital Customer Platform from Open toward Won while the current deal and weighted values stay visible.",
        labels: {
          focal: "Deal",
          semantic: ["Deal value", "Weighted value"],
        },
        title: "Move one deal without losing the numbers",
      },
    },
  },
};

function pilot(slug: FeatureVisualPilotSlug, locale: ContentLocale) {
  const result = getFeatureVisualPilot(
    slug,
    locale,
    PILOT_SOURCES[slug][locale],
  );
  if (!result) throw new Error(`${slug} ${locale} did not resolve its pilot`);

  return result;
}

describe("semantic marketing-section tones", () => {
  it("renders an authored marker and full-width palette surface for every tone", () => {
    const markup = renderToStaticMarkup(
      createElement(Fragment, null, [
        createElement(MarketingSection, { key: "page" }),
        createElement(MarketingSection, { key: "canvas", tone: "canvas" }),
        createElement(MarketingSection, { key: "inverse", tone: "inverse" }),
      ]),
    );

    expect(markup).toContain('data-marketing-tone="page"');
    expect(markup).toContain('data-marketing-tone="canvas"');
    expect(markup).toContain('data-marketing-tone="inverse"');
    expect(
      markup.match(/class="marketing-section bg-background text-foreground"/gu),
    ).toHaveLength(2);
    expect(markup).toContain(
      'class="marketing-section bg-sidebar text-foreground"',
    );
  });

  it("reuses the complete opposite token blocks and keeps explicit artboard palettes intact", () => {
    const styles = readFileSync(
      join(REPO_ROOT, "styles", "globals.css"),
      "utf8",
    );
    const renderer = readFileSync(
      join(REPO_ROOT, "components", "marketing", "visuals", "story-visual.tsx"),
      "utf8",
    );

    expect(styles).toMatch(
      /:root,\s*\.light,\s*\.dark \[data-marketing-tone="inverse"\]\s*\{/u,
    );
    expect(styles).toMatch(
      /\.dark,\s*:root:not\(\.dark\) \[data-marketing-tone="inverse"\],\s*\.light \[data-marketing-tone="inverse"\]\s*\{/u,
    );
    expect(styles.match(/--background:/gu)).toHaveLength(2);
    expect(styles).toContain("color-scheme: light");
    expect(styles).toContain("color-scheme: dark");
    expect(styles).toContain(
      '&:is(.dark *):not(:is([data-marketing-tone="inverse"], [data-marketing-tone="inverse"] *))',
    );
    expect(styles).toContain(
      '&:is(:root:not(.dark) [data-marketing-tone="inverse"], :root:not(.dark) [data-marketing-tone="inverse"] *)',
    );
    expect(styles).toContain(
      '&:is(.light [data-marketing-tone="inverse"], .light [data-marketing-tone="inverse"] *)',
    );
    expect(renderer).toContain('theme === "dark" ? "dark" : "light"');
  });

  it("compiles dark utilities against the inverse boundary after vendor variants", async () => {
    const stylesheetPath = join(REPO_ROOT, "styles", "globals.css");
    const styles = readFileSync(stylesheetPath, "utf8");
    const compileUtility = async (source: string, from = stylesheetPath) => {
      const compiled = await postcss([tailwindcss() as AcceptedPlugin]).process(
        source,
        { from },
      );
      const utilityStart = compiled.css.indexOf(".dark\\:bg-red-500");

      expect(utilityStart).toBeGreaterThan(-1);
      return compiled.css.slice(utilityStart, utilityStart + 900);
    };
    const utility = await compileUtility(
      `${styles}\n@source inline("dark:bg-red-500");`,
    );
    const localVariant = styles.match(
      /@custom-variant dark \([\s\S]*?\n\);/u,
    )?.[0];
    if (!localVariant)
      throw new Error("The local dark variant declaration is missing");
    const plantedVendorOverride = await compileUtility(
      `${styles.replace(localVariant, "@custom-variant dark (&:where(.dark, .dark *));")}\n@source inline("dark:bg-red-500");`,
      join(REPO_ROOT, "styles", "globals-planted-variant.css"),
    );

    expect(utility).toContain(
      '&:is(.dark *):not(:is([data-marketing-tone="inverse"], [data-marketing-tone="inverse"] *))',
    );
    expect(utility).toContain(
      '&:is(:root:not(.dark) [data-marketing-tone="inverse"], :root:not(.dark) [data-marketing-tone="inverse"] *)',
    );
    expect(utility).not.toContain("&:where(.dark, .dark *)");
    expect(plantedVendorOverride).toContain("&:where(.dark, .dark *)");
    expect(plantedVendorOverride).not.toContain(
      '[data-marketing-tone="inverse"]',
    );
  });

  it("resolves only inverse-local image paths to the opposite global theme", () => {
    expect(resolveMarketingImageTheme("light", "page")).toBe("light");
    expect(resolveMarketingImageTheme("dark", "canvas")).toBe("dark");
    expect(resolveMarketingImageTheme("light", "inverse")).toBe("dark");
    expect(resolveMarketingImageTheme("dark", "inverse")).toBe("light");
  });

  it("authors one contrast anchor immediately after surfaces and documents the scarcity rule", () => {
    const foundations = STYLEGUIDE_CHAPTERS.find(
      (chapter) => chapter.id === "foundations",
    );
    const source = readFileSync(
      join(
        REPO_ROOT,
        "app",
        "[locale]",
        "(static)",
        "styleguide",
        "foundations",
        "page.tsx",
      ),
      "utf8",
    );

    expect(
      foundations?.sections.slice(0, 3).map((section) => section.id),
    ).toEqual(["surfaces", "contrast", "edges-washes"]);
    expect(
      foundations?.sections.filter((section) => section.id === "contrast"),
    ).toHaveLength(1);
    expect(source.match(/id="contrast"/gu)).toHaveLength(1);
    expect(source).toContain('tone="inverse"');
    expect(source).toContain("Inverse sections are never nested or adjacent.");
    expect(source).toContain('src="customermates.svg"');
  });
});

describe("feature-page visual pilots", () => {
  it("registers exactly two slugs across every content locale with stable patterns and section IDs", () => {
    expect(FEATURE_VISUAL_PILOT_SLUGS).toEqual([
      "email-integration",
      "pipeline",
    ]);
    expect(Object.keys(FEATURE_VISUAL_PILOT_REGISTRY)).toEqual(
      FEATURE_VISUAL_PILOT_SLUGS,
    );
    expect(FEATURE_VISUAL_PILOT_REGISTRY["email-integration"].patternId).toBe(
      "S-03",
    );
    expect(FEATURE_VISUAL_PILOT_REGISTRY.pipeline.patternId).toBe("S-04");

    for (const slug of FEATURE_VISUAL_PILOT_SLUGS) {
      const localized = CONTENT_LOCALES.map((locale) => pilot(slug, locale));
      expect(new Set(localized.map((entry) => entry.sectionId))).toHaveLength(
        1,
      );
      expect(new Set(localized.map((entry) => entry.patternId))).toHaveLength(
        1,
      );
      expect(new Set(localized.map((entry) => entry.brief.id))).toHaveLength(1);
      expect(localized.every((entry) => entry.tone === "inverse")).toBe(true);
      expect(
        localized.every((entry) => entry.brief.placements.join() === "split"),
      ).toBe(true);
      expect(
        localized.every((entry) => !entry.brief.id.startsWith("golden.")),
      ).toBe(true);
      expect(
        localized.every(
          (entry) => entry.brief.focalLabel?.locale === entry.locale,
        ),
      ).toBe(true);
      expect(
        localized.every((entry) => entry.brief.semanticLabels.length === 2),
      ).toBe(true);
      expect(
        Object.keys(FEATURE_VISUAL_PILOT_REGISTRY[slug].sourceChecksum).sort(),
      ).toEqual([...CONTENT_LOCALES].sort());
    }
  });

  it("tracks the localized hero checksum instead of silently accepting changed source copy", () => {
    for (const slug of FEATURE_VISUAL_PILOT_SLUGS) {
      for (const locale of CONTENT_LOCALES) {
        const source = PILOT_SOURCES[slug][locale];
        expect(FEATURE_VISUAL_PILOT_REGISTRY[slug].sourceChecksum[locale]).toBe(
          visualSourceChecksum(source.hero.title, source.hero.description),
        );
      }
    }

    const changed = structuredClone(PILOT_SOURCES.pipeline.en);
    changed.hero.description += " Changed.";
    expect(() => getFeatureVisualPilot("pipeline", "en", changed)).toThrow(
      /source changed/u,
    );
  });

  it("renders bespoke three-plane compositions with one focal object and native fixtures", () => {
    const email = renderToStaticMarkup(
      createElement(FeaturePagePilotVisual, {
        brief: pilot("email-integration", "en").brief,
        description: pilot("email-integration", "en").copy.description,
      }),
    );
    const pipeline = renderToStaticMarkup(
      createElement(FeaturePagePilotVisual, {
        brief: pilot("pipeline", "en").brief,
        description: pilot("pipeline", "en").copy.description,
      }),
    );

    for (const markup of [email, pipeline]) {
      expect(markup.match(/data-focal-object="true"/gu)).toHaveLength(1);
      expect(markup.match(/data-depth-plane="[123]"/gu)).toHaveLength(3);
      expect(markup).toContain('data-story-theme="inherit"');
      expect(markup).not.toContain("data-golden-placement");
    }

    expect(email).toContain(
      'aria-label="Seven supported channels surround Anna Müller&#x27;s record.',
    );
    expect(pipeline).toContain(
      `aria-label="${pilot("pipeline", "en").copy.description}"`,
    );

    for (const provider of [
      "gmail",
      "outlook",
      "linkedin",
      "whatsapp",
      "telegram",
      "instagram",
      "imap",
    ])
      expect(email).toContain(`data-native-provider="${provider}"`);
    expect(email).toContain('data-native-person="anna-mueller"');
    expect(email).toContain('data-native-conversation="gmail-rollout-next-steps"');
    expect(email).toContain("Next steps for the rollout");
    expect(email).not.toContain("Roche");
    expect(email.match(/data-native-provider-identity=/gu)).toHaveLength(1);
    expect(email.match(/data-active-source="true"/gu)).toHaveLength(1);
    expect(email.match(/data-connector-provider=/gu)).toHaveLength(7);
    expect(email.match(/data-connector-source=/gu)).toHaveLength(7);
    expect(email.match(/data-connector-target=/gu)).toHaveLength(7);
    expect(email.match(/stroke-linecap="butt"/gu)).toHaveLength(7);
    expect(email).not.toMatch(
      /stroke-dasharray|strokeDasharray|data-connector-for/u,
    );
    expect(email).toContain("Customer record");
    expect(email).toContain("Conversation");
    expect(email).toContain("Associated");

    expect(pipeline).toContain('data-native-person="max-bergmann"');
    expect(pipeline).toContain('data-native-record-assignee="max-bergmann"');
    expect(
      pipeline.match(/data-native-record="deal-digital-customer-platform"/gu),
    ).toHaveLength(1);
    expect(pipeline).toContain('data-native-status="deal-open"');
    expect(pipeline).toContain('data-native-status="deal-won"');
    expect(pipeline).toContain('data-native-status="deal-lost"');
    expect(pipeline).toContain('data-drag-state="intermediary"');
    expect(pipeline.match(/data-drag-pointer="true"/gu)).toHaveLength(1);
    expect(
      pipeline.match(/data-drag-source-gap="deal-digital-customer-platform"/gu),
    ).toHaveLength(1);
    expect(pipeline.match(/data-drag-footprint="matched"/gu)).toHaveLength(2);
    expect(pipeline).toContain('data-deal-value="198500"');
    expect(pipeline).toContain('data-weighted-value="59550"');
    expect(pipeline).toContain('data-kanban-column-total="725500"');
    expect(pipeline).toContain('data-kanban-column-weighted="217650"');
    expect(pipeline).toContain("Deal value");
    expect(pipeline).toContain("Weighted value");
    expect(pipeline).toContain("€198,500");
    expect(pipeline).toContain("€59,550");
    expect(pipeline).not.toContain("BMW");
    expect(pipeline).toContain(">162<");

    const localizedEmail = renderToStaticMarkup(
      createElement(FeaturePagePilotVisual, {
        brief: pilot("email-integration", "de").brief,
        description: pilot("email-integration", "de").copy.description,
      }),
    );
    const localizedPipeline = renderToStaticMarkup(
      createElement(FeaturePagePilotVisual, {
        brief: pilot("pipeline", "de").brief,
        description: pilot("pipeline", "de").copy.description,
      }),
    );

    expect(localizedEmail).toContain("Kundendatensatz");
    expect(localizedEmail).toContain("Zugeordnet");
    expect(localizedEmail).toContain("Nächste Schritte für den Rollout");
    expect(localizedEmail).not.toContain("Next steps for the rollout");
    expect(localizedPipeline).toContain("Dealwert");
    expect(localizedPipeline).toContain("Gewichteter Wert");
    expect(localizedPipeline).toContain("Offen");
    expect(localizedPipeline).toContain("Gewonnen");
    expect(localizedPipeline).toContain("Verloren");
    expect(localizedPipeline).toMatch(/198[.\u00a0]500/u);
    expect(localizedPipeline).toMatch(/59[.\u00a0]550/u);
    expect(localizedPipeline).not.toMatch(/>(?:Open|Won|Lost)</u);
  });

  it("keeps composed native identities from announcing their visible names twice", () => {
    const provider = renderToStaticMarkup(
      createElement(ProviderIdentity, { provider: "gmail" }),
    );
    const person = renderToStaticMarkup(
      createElement(PersonIdentity, { person: "anna-mueller" }),
    );

    expect(provider).toContain('alt=""');
    expect(provider.match(/Gmail/gu)).toHaveLength(1);
    expect(person).toContain('alt=""');
    expect(person.match(/Anna Müller/gu)).toHaveLength(1);
  });

  it("keeps pilot assertions fixture-backed while allowing seeded pipeline values", () => {
    const email = pilot("email-integration", "en").brief;
    const pipeline = pilot("pipeline", "en").brief;
    const pipelineAssertions = [
      pipeline.source.headline,
      pipeline.source.body,
      pipeline.takeaway,
      pipeline.depiction.statement,
    ];

    expect(email.factReferences).toEqual([
      "product:conversation-record-association",
      "product:unified-inbox-channel-set",
    ]);
    expect(pipeline.factReferences).toEqual([
      "product:deal-kanban-movement",
      "product:deal-status-field",
      "product:deal-weighted-values",
    ]);
    expect(pipelineAssertions.some((value) => /\p{N}/u.test(value))).toBe(
      false,
    );
  });

  it("rejects product proof, golden IDs and unsupported subject shapes", () => {
    const email = structuredClone(pilot("email-integration", "en").brief);
    email.supportingSubjects = [];

    const goldenId = structuredClone(pilot("pipeline", "en").brief);
    goldenId.id = "golden.focus";

    const proofSource = {
      body: "A local capture.",
      headline: "Reachable state",
    };
    const proof = validateVisualBrief({
      capture: {
        localPath: "/captures/light/pipeline.png",
        reachableStateReference: "fixture.pipeline",
      },
      id: "proof.pipeline",
      kind: "product-proof",
      locale: "en",
      placements: ["split"],
      referenceSystemVersion: VISUAL_REFERENCE_SYSTEM_VERSION,
      selection: "explicit",
      source: {
        ...proofSource,
        checksum: visualSourceChecksum(proofSource.headline, proofSource.body),
      },
    });

    expect(() => validateFeaturePagePilotVisualBrief(email)).toThrow(
      /approved unified-inbox provider set/u,
    );
    expect(() => validateFeaturePagePilotVisualBrief(goldenId)).toThrow(
      /golden benchmark/u,
    );
    expect(() => validateFeaturePagePilotVisualBrief(proof)).toThrow(
      /only render brand illustrations/u,
    );
  });

  it("leaves non-pilot slugs on the legacy screenshot branch and keeps golden geometry private to benchmarks", () => {
    const route = readFileSync(
      join(
        REPO_ROOT,
        "app",
        "[locale]",
        "(static)",
        "features",
        "[slug]",
        "page.tsx",
      ),
      "utf8",
    );
    const pilotComponent = readFileSync(
      join(REPO_ROOT, "components", "marketing", "feature-visual-pilot.tsx"),
      "utf8",
    );
    const pilotVisual = readFileSync(
      join(
        REPO_ROOT,
        "components",
        "marketing",
        "feature-page-pilot-visual.tsx",
      ),
      "utf8",
    );
    const publicVisualApi = readFileSync(
      join(REPO_ROOT, "components", "marketing", "visuals", "index.ts"),
      "utf8",
    );

    expect(
      getFeatureVisualPilot(
        "contact-management",
        "en",
        PILOT_SOURCES.pipeline.en,
      ),
    ).toBeNull();
    expect(route).toContain("visualPilot ?");
    expect(route).toContain("src={`${slug}.png`}");
    expect(pilotVisual).not.toMatch(/GoldenStoryVisual|goldens|story-visual/u);
    expect(publicVisualApi).toContain("GoldenStoryVisual");
    expect(publicVisualApi).not.toContain("FeaturePagePilotVisual");
    expect(`${pilotComponent}\n${pilotVisual}`).not.toContain("dark:");
    expect(pilotComponent.match(/lg:max-w-\[28rem\]/gu)).toHaveLength(2);
    expect(pilotComponent).not.toMatch(/(?<!lg:)max-w-\[28rem\]/u);
    expect(pilotVisual).toContain("aspect-square");
    expect(pilotVisual).toContain("aspect-[4/3]");
  });
});
