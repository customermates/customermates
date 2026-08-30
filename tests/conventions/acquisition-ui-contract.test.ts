import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { parse } from "yaml";
import { describe, expect, it } from "vitest";

import { AcquisitionStoryVisual } from "@/components/marketing/acquisition-story-visual";
import { acquisitionPageSchema } from "@/core/fumadocs/schemas/common";
import { CONTENT_LOCALES, type ContentLocale } from "@/i18n/locale-registry";

import { REPO_ROOT } from "./walk";

const loadModule = createRequire(import.meta.url);
const { JSDOM } = loadModule("jsdom") as {
  JSDOM: new (html: string) => { window: { document: Document } };
};

const ACQUISITION_PAGES = [
  ["feature-pages", "self-hosted"],
  ["feature-pages", "unified-inbox"],
  ["for-pages", "agencies"],
  ["for-pages", "professional-services"],
  ["blog-posts", "agentic-crm"],
  ["blog-posts", "open-source-crm"],
] as const;

// These paths were calibrated against the rendered opaque subject bounds at 390, 800, and
// 1280 CSS pixels. Exact signatures keep later visual edits from silently reopening detached
// connector gaps; compound converge/fork pathways deliberately remain one painted path.
const CALIBRATED_CONNECTOR_PATHS = {
  "agentic-crm": {
    narrow: ["M160 120 C255 120 235 220 285 264"],
    split: ["M170 160 C330 160 285 285 350 348"],
    wide: ["M184 211 C260 211 292 178 358 178"],
  },
  "open-source-crm": {
    narrow: ["M300 184 C300 236 300 292 300 352"],
    split: [
      "M216 212 C216 300 310 320 400 360 M584 212 C584 300 490 320 400 360 M400 360 C400 400 400 430 400 458",
    ],
    wide: [
      "M362 132 C410 132 418 228 450 280 M362 366 C410 366 418 326 450 280 M450 280 C464 280 476 280 488 280",
    ],
  },
  "self-hosted": {
    narrow: ["M300 176 C300 224 300 280 300 328"],
    split: [
      "M400 174 C400 240 400 300 400 358",
      "M400 596 C400 680 400 790 400 858",
    ],
    wide: [
      "M282 232 C306 232 324 232 348 232",
      "M652 222 C676 222 694 222 718 222",
    ],
  },
  "unified-inbox": {
    narrow: ["M300 256 C300 310 300 370 300 432"],
    split: [
      "M400 250 C400 310 400 345 400 370 M400 370 C400 430 266 438 266 508 M400 370 C400 452 684 460 684 588",
    ],
    wide: [
      "M532 245 C552 245 565 245 580 245 M580 245 C598 230 602 170 628 170 M580 245 C598 265 602 380 628 380",
    ],
  },
} as const;

const CALIBRATED_CONNECTOR_LAYOUTS = {
  "agentic-crm": {
    narrow: {
      subjects: [
        ["external-ai-client", "left:7%;top:10%"],
        ["reviewable-draft", "left:8%;top:32%;width:84%"],
      ],
      viewBox: "0 0 600 800",
    },
    split: {
      subjects: [
        ["external-ai-client", "left:8%;top:13%"],
        ["reviewable-draft", "left:13%;top:34%;width:74%"],
      ],
      viewBox: "0 0 800 1000",
    },
    wide: {
      subjects: [
        ["external-ai-client", "left:7%;top:34%"],
        ["reviewable-draft", "left:35%;top:15%;width:47%"],
      ],
      viewBox: "0 0 1000 560",
    },
  },
  "open-source-crm": {
    narrow: {
      subjects: [
        ["self-hosted-app", "left:8%;top:43%;width:84%"],
        ["source-code", "left:11%;top:12%;width:78%"],
      ],
      viewBox: "0 0 600 800",
    },
    split: {
      subjects: [
        ["postgresql", "right:8%;top:12%;width:38%"],
        ["self-hosted-app", "left:12%;top:45%;width:76%"],
        ["source-code", "left:8%;top:12%;width:38%"],
      ],
      viewBox: "0 0 800 1000",
    },
    wide: {
      subjects: [
        ["postgresql", "left:8%;top:59%;width:29%"],
        ["self-hosted-app", "left:48%;top:23%;width:43%"],
        ["source-code", "left:8%;top:17%;width:29%"],
      ],
      viewBox: "0 0 1000 560",
    },
  },
  "self-hosted": {
    narrow: {
      subjects: [
        ["postgresql", "left:12%;top:11%;width:76%"],
        ["self-hosted-app", "left:8%;top:40%;width:84%"],
      ],
      viewBox: "0 0 600 800",
    },
    split: {
      subjects: [
        ["mcp-client", "bottom:9%;left:16%;width:68%"],
        ["postgresql", "left:16%;top:10%;width:68%"],
        ["self-hosted-app", "left:10%;top:35%;width:80%"],
      ],
      viewBox: "0 0 800 1000",
    },
    wide: {
      subjects: [
        ["mcp-client", "right:5%;top:35%;width:24%"],
        ["postgresql", "left:5%;top:35%;width:24%"],
        ["self-hosted-app", "left:34%;top:19%;width:32%"],
      ],
      viewBox: "0 0 1000 560",
    },
  },
  "unified-inbox": {
    narrow: {
      subjects: [
        ["conversation-list", "left:8%;top:53%;width:84%"],
        ["inbox-providers", "left:8%;top:10%;width:84%"],
      ],
      viewBox: "0 0 600 800",
    },
    split: {
      subjects: [
        ["contact-context", "right:8%;top:58%;width:29%"],
        ["conversation-list", "left:8%;top:50%;width:51%"],
        ["inbox-providers", "left:10%;top:9%;width:80%"],
      ],
      viewBox: "0 0 800 1000",
    },
    wide: {
      subjects: [
        ["contact-context", "right:7%;top:58%;width:31%"],
        ["conversation-list", "right:7%;top:14%;width:31%"],
        ["inbox-providers", "left:7%;top:16%;width:47%"],
      ],
      viewBox: "0 0 1000 560",
    },
  },
} as const;

function source(path: string) {
  return readFileSync(join(REPO_ROOT, path), "utf8");
}

function acquisitionBrief(
  collection: string,
  locale: ContentLocale,
  slug: string,
) {
  const input = source(`content/${collection}/${locale}/${slug}.mdx`);
  const frontmatter = /^---\n(.*?)\n---\n?/su.exec(input);
  if (!frontmatter)
    throw new Error(`${collection}/${locale}/${slug} has no frontmatter`);
  const acquisition = acquisitionPageSchema.parse(
    (parse(frontmatter[1]) as { acquisition: unknown }).acquisition,
  );
  if (acquisition.visual.kind !== "brand-illustration")
    throw new Error(`${slug} is not an illustration brief`);
  return acquisition.visual;
}

describe("public acquisition UI contract", () => {
  it("uses the current marketing system for shared heroes and closing panels", () => {
    const hero = source("components/marketing/page-hero.tsx");
    expect(hero).toContain("<GridPattern");
    expect(hero).toContain("<MarketingContainer");
    expect(hero).toContain("text-display");
    expect(hero).toContain("visual?: ReactNode");
    expect(hero).not.toContain("WaveDecoration");
    expect(hero).not.toContain("var(--font-serif)");
    expect(hero).toContain('buttonRightHref.startsWith("https://")');
    expect(hero).toContain(
      'target={buttonRightIsExternal ? "_blank" : undefined}',
    );
    expect(hero).toContain(
      'rel={buttonRightIsExternal ? "noopener noreferrer" : undefined}',
    );

    const closing = source("components/marketing/cta-section.tsx");
    expect(closing).toContain("<MarketingSection");
    expect(closing).toContain("marketing-grid");
    expect(closing).toContain("border-y border-border");
    expect(closing).not.toContain("rounded-card");
    expect(closing).not.toContain("bg-sidebar");
    expect(closing).not.toContain("rgba(");
    expect(closing).not.toContain("blur-[80px]");
    expect(closing).toContain('buttonRightHref.startsWith("https://")');
    expect(closing).toContain(
      'target={buttonRightIsExternal ? "_blank" : undefined}',
    );
    expect(closing).toContain(
      'rel={buttonRightIsExternal ? "noopener noreferrer" : undefined}',
    );
  });

  it("keeps long-form content readable and media explicit", () => {
    const article = source("components/marketing/landing-article.tsx");
    expect(article).toContain('tone="canvas"');
    expect(article).toContain("mx-auto max-w-[96ch]");
    expect(article).toContain("[&>p]:max-w-[82ch]");
    expect(article).toContain("lg:mx-0 lg:max-w-none");
    expect(article).toContain(
      "asideFooter={founderContact ? <FounderContactCard /> : undefined}",
    );
    expect(article).toContain("[--toc-sticky-top:5.5rem]");
    expect(article).not.toContain("rounded-panel");
    expect(article).not.toContain("shadow-sm");

    for (const route of [
      "app/[locale]/(static)/features/[slug]/page.tsx",
      "app/[locale]/(static)/for/[industry]/page.tsx",
      "app/[locale]/(static)/compare/[competitor]/page.tsx",
      "app/[locale]/(static)/blog/[slug]/page.tsx",
    ]) {
      const routeSource = source(route);
      expect(routeSource, route).toContain("<LandingArticle");
      expect(routeSource, route).not.toContain("<ShowcaseFrame");
    }
  });

  it("keeps the founder contact on every long-form detail page", () => {
    const article = source("components/marketing/landing-article.tsx");
    const card = source("components/marketing/founder-contact-card.tsx");
    const toc = source("components/shared/toc.tsx");

    expect(article).toContain("founderContact = false");
    expect(article.match(/<FounderContactCard/gu)).toHaveLength(1);
    expect(card).toContain('href="/contact"');
    expect(card).toContain('src="benjamin-wagner.png"');
    expect(card).toContain("highlights.personal.body");
    expect(card).toContain('data-founder-contact-variant="note"');
    expect(card).not.toContain("FounderContactCardVariant");
    expect(toc).toContain("asideFooter?: ReactNode");
    expect(toc).toContain("hasMobileFooter");
    expect(toc).toContain('hasMobileFooter && "hidden lg:block"');
    expect(toc).toContain("{asideFooter ?");

    for (const route of [
      "app/[locale]/(static)/features/[slug]/page.tsx",
      "app/[locale]/(static)/for/[industry]/page.tsx",
      "app/[locale]/(static)/compare/[competitor]/page.tsx",
    ]) {
      expect(source(route), route).toContain("<LandingArticle founderContact");
    }

    expect(source("app/[locale]/(static)/blog/[slug]/page.tsx")).toContain(
      "<LandingArticle founderContact items={page.data.toc}",
    );

  });

  it("uses one route-owned related-content and CTA ending across acquisition and blog pages", () => {
    const ending = source("components/marketing/page-ending.tsx");
    const related = source("components/marketing/related-pages.tsx");
    expect(ending).toContain("<RelatedPages>");
    expect(ending).toContain("relatedHrefs.map");
    expect(ending.indexOf("<RelatedPages>")).toBeLessThan(
      ending.indexOf("<CTASection"),
    );
    expect(related).not.toContain("presentation");
    expect(related).not.toContain("HubPostCard");
    expect(related).not.toContain("imageSrc");
    expect(related).toContain("<ArrowUpRight");
    expect(related).toContain("target.description");
    expect(related).toContain("target.title");
    expect(related).toContain("border-t border-border");

    for (const route of [
      "app/[locale]/(static)/features/[slug]/page.tsx",
      "app/[locale]/(static)/for/[industry]/page.tsx",
      "app/[locale]/(static)/compare/[competitor]/page.tsx",
      "app/[locale]/(static)/blog/[slug]/page.tsx",
    ]) {
      const routeSource = source(route);
      const article = routeSource.indexOf("<LandingArticle");
      const endingUse = routeSource.indexOf("<PageEnding", article);
      const footer = routeSource.indexOf("<Footer", endingUse);
      expect(endingUse, route).toBeGreaterThan(article);
      expect(footer, route).toBeGreaterThan(endingUse);
    }
  });

  it("keeps article proof and callout icons on the homepage and product primitives", () => {
    const blocks = source("components/marketing/article-blocks.tsx");
    const alert = source("components/shared/alert.tsx");

    expect(blocks).toContain(
      'className="not-prose my-10 border-y border-border"',
    );
    expect(blocks).not.toContain("CircleCheckBig");
    expect(blocks).not.toContain(
      'className="not-prose my-10 border-y border-border bg-background"',
    );
    expect(blocks).toContain("icon: ALERT_ICONS.warning");
    expect(blocks).toContain("icon: ALERT_ICONS.primary");
    expect(blocks).toContain("icon: ALERT_ICONS.default");
    expect(blocks).not.toContain("size-8 shrink-0 place-items-center");
    expect(alert).toContain("export const ALERT_ICONS");

    const postCard = source("components/marketing/post-card.tsx");
    expect(postCard).toContain("border-t border-border");
    expect(postCard).not.toContain("AppImage");
    expect(postCard).not.toContain("placeholderLabel");
    expect(postCard).not.toContain("from-primary/25 via-primary/10");
  });

  it("recomposes acquisition artboards across every approved placement without an outer frame", () => {
    const visual = source("components/marketing/acquisition-story-visual.tsx");
    const artboardOpening = visual.match(/<VisualArtboard[\s\S]*?>/u)?.[0];

    expect(visual).toContain("VISUAL_PLACEMENTS.filter");
    expect(visual).toContain(
      'data-acquisition-responsive-placements="narrow:base wide:sm split:lg"',
    );
    expect(visual).toContain('data-detail-budget="narrow:2 wide:4 split:3"');
    expect(visual).toContain('data-detail-unit="semantic-object"');
    expect(visual).toContain(
      'data-supported-placements={brief.placements.join(" ")}',
    );
    expect(visual).toContain("aspect-[3/4]");
    expect(visual).toContain("sm:aspect-hero");
    expect(visual).toContain("sm:min-h-[30rem]");
    expect(visual).toContain("lg:aspect-[4/5]");
    expect(visual).toContain("lg:min-h-0");
    expect(artboardOpening).toBeDefined();
    expect(artboardOpening).not.toMatch(/\bborder(?:-|\b)|\bshadow(?:-|\b)/u);
  });

  it("renders brief-owned subjects and independently authored responsive scenes", () => {
    const placementContract = {
      narrow: {
        classNames: ["sm:hidden"],
        density: "essential",
        maxDetails: 2,
      },
      split: {
        classNames: ["hidden", "lg:block"],
        density: "context",
        maxDetails: 3,
      },
      wide: {
        classNames: ["hidden", "sm:block", "lg:hidden"],
        density: "full",
        maxDetails: 4,
      },
    } as const;

    for (const [collection, slug] of ACQUISITION_PAGES) {
      for (const locale of CONTENT_LOCALES) {
        const brief = acquisitionBrief(collection, locale, slug);
        const html = renderToStaticMarkup(
          createElement(AcquisitionStoryVisual, { brief, locale }),
        );
        const document = new JSDOM(html).window.document;
        const declaredSubjects = new Set([
          brief.focalSubject.id,
          ...brief.supportingSubjects.map((subject) => subject.id),
        ]);
        const renderedSubjects = new Set(
          [
            ...document.querySelectorAll<HTMLElement>("[data-visual-subject]"),
          ].map((element) => element.dataset.visualSubject ?? ""),
        );
        const detailIds: Record<keyof typeof placementContract, Set<string>> = {
          narrow: new Set(),
          split: new Set(),
          wide: new Set(),
        };
        const connectorSignatures: string[] = [];
        const layoutSignatures: string[] = [];

        expect(renderedSubjects, `${locale}/${slug}: subject coverage`).toEqual(
          declaredSubjects,
        );
        expect(
          document.querySelectorAll("[data-focal-object=true]"),
        ).toHaveLength(3);

        for (const [placement, contract] of Object.entries(placementContract)) {
          const placementKey = placement as keyof typeof placementContract;
          const scene = document.querySelector<HTMLElement>(
            `[data-visual-placement=${placement}]`,
          );
          expect(
            scene,
            `${locale}/${slug}: missing ${placement}`,
          ).not.toBeNull();
          if (!scene) continue;

          for (const className of contract.classNames)
            expect(scene.classList.contains(className)).toBe(true);
          expect(scene.dataset.detailDensity).toBe(contract.density);
          expect(
            scene.querySelectorAll("[data-focal-object=true]"),
          ).toHaveLength(1);
          const focal = scene.querySelector<HTMLElement>(
            "[data-focal-object=true]",
          );
          expect(focal?.dataset.visualSubject).toBe(brief.focalSubject.id);
          expect(
            focal
              ?.querySelector<HTMLElement>("[data-visual-label=focal]")
              ?.textContent?.trim(),
          ).toBe(brief.focalLabel?.text);

          const sceneSubjects = [
            ...scene.querySelectorAll<HTMLElement>("[data-visual-subject]"),
          ];
          const renderedSceneSubjects = new Set(
            sceneSubjects.map((subject) => subject.dataset.visualSubject ?? ""),
          );
          for (const subject of sceneSubjects) {
            const detail = subject.closest<HTMLElement>("[data-detail-id]");
            expect(
              declaredSubjects.has(subject.dataset.visualSubject ?? ""),
              `${locale}/${slug}: ${placement} has undeclared subject`,
            ).toBe(true);
            expect(
              detail,
              `${locale}/${slug}: ${placement} has unbudgeted semantic content`,
            ).not.toBeNull();
            const ownedSubjects = new Set([
              detail?.dataset.detailId ?? "",
              ...(detail?.dataset.detailComposite?.split(" ").filter(Boolean) ??
                []),
            ]);
            expect(
              ownedSubjects.has(subject.dataset.visualSubject ?? ""),
              `${locale}/${slug}: ${placement} has an implicit subject composite`,
            ).toBe(true);
          }
          for (const label of scene.querySelectorAll<HTMLElement>(
            "[data-visual-label]",
          ))
            expect(label.dataset.visualLabelSubject).toBe(
              label.closest<HTMLElement>("[data-visual-subject]")?.dataset
                .visualSubject,
            );
          layoutSignatures.push(
            sceneSubjects
              .map(
                (subject) =>
                  `${subject.dataset.visualSubject}:${subject.getAttribute("style") ?? "nested"}`,
              )
              .sort()
              .join("|"),
          );

          const details = [
            ...scene.querySelectorAll<HTMLElement>("[data-detail-id]"),
          ];
          expect(
            details.length,
            `${locale}/${slug}: ${placement} detail budget`,
          ).toBeLessThanOrEqual(contract.maxDetails);
          detailIds[placementKey] = new Set(
            details.map((element) => element.dataset.detailId ?? ""),
          );
          expect(detailIds[placementKey].size).toBe(details.length);
          for (const detail of details) {
            expect(detail.dataset.detailId).toBe(detail.dataset.visualSubject);
            expect(
              Number(detail.dataset.detailPriority),
            ).toBeGreaterThanOrEqual(1);
            expect(Number(detail.dataset.detailPriority)).toBeLessThanOrEqual(
              contract.maxDetails,
            );
          }

          const connectors = [
            ...scene.querySelectorAll<SVGPathElement>(
              "path[data-connector-source]",
            ),
          ];
          const calibrated =
            CALIBRATED_CONNECTOR_PATHS[
              slug as keyof typeof CALIBRATED_CONNECTOR_PATHS
            ];
          const calibratedLayout =
            CALIBRATED_CONNECTOR_LAYOUTS[
              slug as keyof typeof CALIBRATED_CONNECTOR_LAYOUTS
            ];
          if (calibrated && calibratedLayout) {
            const expectedLayout = calibratedLayout[placementKey];
            expect(
              connectors.map((connector) => connector.getAttribute("d")),
              `${locale}/${slug}: ${placement} calibrated connector geometry`,
            ).toEqual(calibrated[placementKey]);
            expect(
              connectors[0]?.closest("svg")?.getAttribute("viewBox"),
              `${locale}/${slug}: ${placement} calibrated viewBox`,
            ).toBe(expectedLayout.viewBox);
            expect(
              details
                .map(
                  (detail) =>
                    [
                      detail.dataset.detailId ?? "",
                      detail.getAttribute("style") ?? "nested",
                    ] as const,
                )
                .sort(([left], [right]) => left.localeCompare(right)),
              `${locale}/${slug}: ${placement} calibrated subject layout`,
            ).toEqual(expectedLayout.subjects);
          }
          if (brief.pathway === "focus") {
            expect(
              connectors,
              `${locale}/${slug}: focus must be connector-free`,
            ).toHaveLength(0);
          } else {
            expect(
              connectors.length,
              `${locale}/${slug}: ${placement} needs a connector`,
            ).toBeGreaterThan(0);
            for (const connector of connectors) {
              expect(connector.getAttribute("stroke-linecap")).toBe("butt");
              expect(connector.hasAttribute("stroke-dasharray")).toBe(false);
              expect(connector.hasAttribute("marker-end")).toBe(false);
              const sourceIds =
                connector.dataset.connectorSource?.split(" ").filter(Boolean) ??
                [];
              const targetIds =
                connector.dataset.connectorTarget?.split(" ").filter(Boolean) ??
                [];
              expect(sourceIds.length).toBeGreaterThan(0);
              expect(targetIds.length).toBeGreaterThan(0);
              for (const endpoint of [...sourceIds, ...targetIds])
                expect(
                  renderedSceneSubjects.has(endpoint),
                  `${locale}/${slug}: ${placement} connector endpoint ${endpoint} is not rendered`,
                ).toBe(true);
              expect(
                sourceIds.some((sourceId) => targetIds.includes(sourceId)),
              ).toBe(false);
            }
            const svg = connectors[0]?.closest("svg");
            connectorSignatures.push(
              `${svg?.getAttribute("viewBox")}:${connectors.map((connector) => connector.getAttribute("d")).join("|")}`,
            );
          }
        }

        expect(
          [...detailIds.narrow].every((id) => detailIds.split.has(id)),
        ).toBe(true);
        expect([...detailIds.split].every((id) => detailIds.wide.has(id))).toBe(
          true,
        );
        expect(detailIds.narrow.size).toBeLessThanOrEqual(detailIds.wide.size);
        expect(new Set(layoutSignatures).size).toBe(3);
        if (brief.pathway !== "focus")
          expect(new Set(connectorSignatures).size).toBe(3);

        const labels = [
          ...document.querySelectorAll<HTMLElement>("[data-visual-label]"),
        ];
        const renderedLabels = new Set(
          labels.map((label) => label.textContent?.trim()),
        );
        const declaredLabels = new Set([
          brief.focalLabel?.text,
          ...brief.semanticLabels.map(({ text }) => text),
        ]);
        expect(renderedLabels, `${locale}/${slug}: labels`).toEqual(
          declaredLabels,
        );

        for (const label of labels) {
          const subject = label.closest<HTMLElement>("[data-visual-subject]")
            ?.dataset.visualSubject;
          expect(
            subject,
            `${locale}/${slug}: label without subject`,
          ).toBeTruthy();
          expect(
            declaredSubjects.has(subject ?? ""),
            `${locale}/${slug}: undeclared label subject`,
          ).toBe(true);
          expect(label.dataset.visualLabelSubject).toBe(subject);
          expect(label.className).toMatch(
            /(?:text-xs|text-sm|text-base|text-meta|text-\[(?:1[1-9]|[2-9]\d)px\])/u,
          );
          expect(label.className).not.toMatch(/text-\[(?:8|9|10)px\]/u);
        }

        const visibleText = document.body.textContent ?? "";
        expect(visibleText).not.toContain(brief.source.headline);
        expect(visibleText).not.toContain(brief.source.body);
        expect(visibleText).not.toContain(brief.takeaway);
        expect(visibleText).not.toContain(brief.depiction.statement);
      }
    }
  });

  it("binds dense acquisition scenes to declared fixture-backed subjects", () => {
    const visual = source("components/marketing/acquisition-story-visual.tsx");
    expect(visual).toContain("VISUAL_CONVERSATION_FIXTURES[conversationId]");
    expect(visual).not.toContain(
      'VISUAL_CONVERSATION_FIXTURES["gmail-rollout-next-steps"]',
    );
    expect(visual).toContain("data-visual-subject={conversationList.id}");
    expect(visual).toContain("data-visual-subject={contactContext.id}");
    expect(visual).toContain('formatDealValue(featured, locale, "weighted")');
    expect(visual).toContain("<NativeAgentProviderIdentity");
    expect(visual).toContain('strokeLinecap="butt"');
    expect(visual).toContain('vectorEffect="non-scaling-stroke"');
    expect(visual).not.toMatch(/ArrowDown|ArrowRight/u);
    expect(visual).not.toContain("{brief.takeaway}</p>");
    expect(visual).toContain('brief.id.includes(".open-source-crm.")');
    expect(visual).toContain('brief.id.includes(".agencies.")');
    expect(visual).toContain("OpenSourceEvaluationVisual");
    expect(visual).toContain("AgencyVisual");
    expect(visual).toContain("data-visual-placement={placement}");
    expect(visual).toContain(
      "data-connector-source={endpointIds(connector.source)}",
    );
    expect(visual).toContain("data-detail-id={brief.focalSubject.id}");
    expect(visual).not.toContain("SCENE_COPY");
    expect(visual).not.toContain("copy.");

    const articleBlocks = source("components/marketing/article-blocks.tsx");
    expect(articleBlocks).toContain("sm:last:col-span-2");
    expect(articleBlocks).toContain("lg:last:col-span-1");
  });

  it("keeps the blog header text-led and delegates social imagery to the generated OG schema", () => {
    const blog = source("app/[locale]/(static)/blog/[slug]/page.tsx");
    const heading = blog.indexOf('<h1 className="text-display m-0">');
    const timestamp = blog.indexOf("<time", heading);

    expect(heading).toBeGreaterThan(-1);
    expect(timestamp).toBeGreaterThan(heading);
    expect(blog).not.toContain("AcquisitionStoryVisual");
    expect(blog).not.toContain("BlogHeroMedia");
    expect(blog).not.toContain("includeHeroImage");
    expect(source("core/seo/schemas.ts")).toContain("image: [ogImage]");
  });
});
