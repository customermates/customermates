import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { REPO_ROOT } from "./walk";

import {
  GOLDEN_VISUAL_BRIEFS,
  getGoldenVisualBrief,
  type GoldenVisualBrief,
} from "@/components/marketing/visuals/goldens";
import { GoldenStoryVisual } from "@/components/marketing/visuals/story-visual";
import {
  APPROVED_NATIVE_VISUAL_ASSETS,
  NATIVE_VISUAL_FIXTURE_SOURCES,
  VISUAL_AGENT_PROVIDER_FIXTURES,
  VISUAL_PERSON_FIXTURES,
  VISUAL_PROVIDER_FIXTURES,
  VISUAL_RECORD_FIXTURES,
  VISUAL_STATUS_FIXTURES,
} from "@/components/marketing/visuals/native-fixtures";
import { NativeAgentProviderIdentity } from "@/components/marketing/visuals/native-visual-primitives";
import {
  type BrandIllustrationBrief,
  type ProductProofBrief,
  type VisualPlacement,
  VISUAL_LOCALES,
  VISUAL_PATHWAYS,
  VISUAL_PLACEMENTS,
  inferVisualKind,
  validateVisualBrief,
  visualSourceChecksum,
} from "@/components/marketing/visuals/visual-contract";
import {
  GOLDEN_LAYOUT,
  STORY_VISUAL_MOTION,
  authoredConnectorPath,
  connectorDrawProgress,
  goldenConnectorCount,
  trimAuthoredConnector,
  type AuthoredConnector,
  type NormalizedBox,
  type NormalizedPoint,
} from "@/components/marketing/visuals/story-visual-layout";
import { GoldenBenchmarkReviewSheet } from "@/components/marketing/visuals/visual-review-sheet";
import { inlineApprovedVisualAssets, inlineReviewFonts } from "@/scripts/lib/inline-marketing-visual-assets";

function clone(brief: BrandIllustrationBrief): Record<string, unknown> {
  return JSON.parse(JSON.stringify(brief)) as Record<string, unknown>;
}

function invalid(input: unknown) {
  return () => validateVisualBrief(input);
}

function render(brief: GoldenVisualBrief, placement: VisualPlacement = "wide") {
  return renderToStaticMarkup(
    createElement(GoldenStoryVisual, {
      brief,
      placement,
      theme: "light",
    }),
  );
}

function rendererBoundaryViolations(source: string) {
  const forbidden = [
    "/components/ui/",
    "/scenes/",
    "/schematics/",
    "/(protected)/",
    "/features/",
    "/ee/",
    "/generated/prisma",
  ];
  const imports = [...source.matchAll(/(?:from\s+|import\s*)["']([^"']+)["']/gu)].map((match) => match[1]);
  return forbidden.filter((segment) => imports.some((specifier) => specifier.includes(segment)));
}

function productProofRendererViolations(source: string) {
  return source.includes("product-proof") && source.includes("GoldenStoryVisual")
    ? ["product-proof uses GoldenStoryVisual"]
    : [];
}

function connectorTargetViolations(
  placement: VisualPlacement,
  focal: NormalizedBox,
  targets: readonly NormalizedPoint[],
) {
  return targets.flatMap((target, index) => {
    const hitsLeadingBorder = placement === "wide" ? target.x === focal.x : target.y === focal.y;
    const landsOnSurface = placement === "wide" || (target.x >= focal.x && target.x <= focal.x + focal.width);

    return hitsLeadingBorder && landsOnSurface ? [] : [`connector ${index + 1} misses ${placement} focal border`];
  });
}

function connectorPathTags(markup: string) {
  return [...markup.matchAll(/<path\b[^>]*data-connector-target="[^"]+"[^>]*>/gu)].map((match) => match[0]);
}

function connectorPrefixViolations(
  connector: AuthoredConnector,
  samples: readonly { progress: number; target: NormalizedPoint }[],
) {
  const violations: string[] = [];
  let previousDistance = -1;

  for (const sample of samples) {
    const distance = Math.hypot(sample.target.x - connector.source.x, sample.target.y - connector.source.y);
    if (distance < previousDistance) violations.push("connector prefix target retreats");
    previousDistance = distance;
  }

  const resolved = samples.at(-1)?.target;
  if (!resolved || resolved.x !== connector.target.x || resolved.y !== connector.target.y)
    violations.push("resolved prefix misses authored target");

  return violations;
}

describe("marketing visual brief", () => {
  it("validates every localized golden without exposing a layout choice", () => {
    for (const pathway of VISUAL_PATHWAYS) {
      for (const locale of VISUAL_LOCALES) {
        const brief = GOLDEN_VISUAL_BRIEFS[pathway][locale];
        expect(validateVisualBrief(brief)).toEqual(brief);
        expect(brief.pathway).toBe(pathway);
        expect(brief).not.toHaveProperty("selectedVariant");
        expect(brief).not.toHaveProperty("composition");
        expect(brief.source.checksum).toBe(visualSourceChecksum(brief.source.headline, brief.source.body));
      }
    }
  });

  it("renders one benchmark in every placement and theme on its review sheet", () => {
    const markup = renderToStaticMarkup(
      createElement(GoldenBenchmarkReviewSheet, {
        brief: getGoldenVisualBrief("converge", "en"),
      }),
    );

    expect(markup.match(/data-story-pathway="converge"/gu)).toHaveLength(6);
    expect(markup.match(/data-golden-placement="(?:wide|split|narrow)"/gu)).toHaveLength(6);
    expect(markup.match(/data-story-theme="(?:light|dark)"/gu)).toHaveLength(6);
    expect(markup).not.toMatch(/data-(?:candidate|composition|preferred|selected-variant|study)/u);

    const germanMarkup = renderToStaticMarkup(
      createElement(GoldenBenchmarkReviewSheet, {
        brief: getGoldenVisualBrief("converge", "de"),
      }),
    );
    expect(germanMarkup.match(/data-story-pathway="converge"/gu)).toHaveLength(6);
    expect(germanMarkup).not.toMatch(/A\/B\/C|Kandidat|Studie|bevorzugt/iu);
  });

  it("rejects the retired selectedVariant field on a generic brief", () => {
    const legacy = clone(getGoldenVisualBrief("converge", "en"));
    legacy.selectedVariant = "edge";

    expect(invalid(legacy)).toThrow();
  });

  it("rejects raw prose fields and excessive subjects or labels", () => {
    const base = getGoldenVisualBrief("converge", "en");
    const rawProse = {
      ...clone(base),
      rawProse: "Lay the complete paragraph into the artwork.",
    };
    const tooManySubjects = clone(base);
    tooManySubjects.supportingSubjects = [
      { form: "channel-mark", id: "one" },
      { form: "channel-mark", id: "two" },
      { form: "channel-mark", id: "three" },
      { form: "channel-mark", id: "four" },
    ];
    const tooManyLabels = clone(base);
    tooManyLabels.semanticLabels = [
      { locale: "en", text: "One" },
      { locale: "en", text: "Two" },
      { locale: "en", text: "Three" },
    ];

    expect(invalid(rawProse)).toThrow();
    expect(invalid(tooManySubjects)).toThrow();
    expect(invalid(tooManyLabels)).toThrow();
  });

  it("rejects missing localization, unsupported facts, numbers and unknown pathways", () => {
    const base = getGoldenVisualBrief("converge", "de");
    const untranslated = clone(base);
    untranslated.focalLabel = { locale: "en", text: "Record" };
    const unsupportedFact = clone(base);
    unsupportedFact.factReferences = ["product:automatic-lead-score"];
    const unsupportedNumber = clone(base);
    unsupportedNumber.takeaway = "One signal produces 42 qualified leads.";
    unsupportedNumber.depiction = {
      kind: "result",
      productBehavior: false,
      statement: "A signal becomes visible.",
    };
    unsupportedNumber.factReferences = [];
    const unknownPathway = clone(base);
    unknownPathway.pathway = "orbit";

    expect(invalid(untranslated)).toThrow(/brief locale/u);
    expect(invalid(unsupportedFact)).toThrow();
    expect(invalid(unsupportedNumber)).toThrow(/numbers require/u);
    expect(invalid(unknownPathway)).toThrow();
  });

  it("allows a bespoke brief to use a pathway without copying its golden subject recipe", () => {
    const bespoke = clone(getGoldenVisualBrief("handoff", "en"));
    bespoke.id = "brief.bespoke-handoff";
    bespoke.accentTarget = "updated-record";
    bespoke.factReferences = ["product:deal-status-field"];
    bespoke.focalLabel = { locale: "en", text: "Updated" };
    bespoke.focalSubject = {
      fixtures: { record: "deal-crm-rollout", status: "deal-won" },
      form: "record",
      id: "updated-record",
    };
    bespoke.semanticLabels = [{ locale: "en", text: "Before" }];
    bespoke.supportingSubjects = [
      { agentProvider: "claude", form: "agent-cue", id: "external-agent" },
      {
        fixtures: { record: "deal-data-analytics", status: "deal-open" },
        form: "context-card",
        id: "prior-state",
      },
    ];

    const validated = validateVisualBrief(bespoke);
    expect(validated).toMatchObject({
      accentTarget: "updated-record",
      id: "brief.bespoke-handoff",
      pathway: "handoff",
    });
    expect(validated).not.toHaveProperty("selectedVariant");

    const soloFocus = clone(getGoldenVisualBrief("focus", "en"));
    soloFocus.id = "brief.solo-focus";
    soloFocus.supportingSubjects = [];
    expect(validateVisualBrief(soloFocus)).toMatchObject({
      id: "brief.solo-focus",
      pathway: "focus",
      supportingSubjects: [],
    });

    const repeatedProvider = clone(getGoldenVisualBrief("converge", "en"));
    repeatedProvider.id = "brief.repeated-provider";
    const repeatedProviderSubjects = repeatedProvider.supportingSubjects as Array<Record<string, unknown>>;
    repeatedProviderSubjects[2].fixtures = { provider: "linkedin" };
    expect(validateVisualBrief(repeatedProvider)).toMatchObject({
      id: "brief.repeated-provider",
      pathway: "converge",
    });
  });

  it("never infers product proof and requires explicit proof selection", () => {
    expect(inferVisualKind(true)).toBe("brand-illustration");
    expect(inferVisualKind(false)).toBe("none");

    const source = {
      body: "A reachable local capture.",
      headline: "Local product proof",
    };
    const automaticProof = {
      capture: {
        localPath: "/captures/light/inbox.png",
        reachableStateReference: "fixture.inbox",
      },
      id: "proof.inbox",
      kind: "product-proof",
      locale: "en",
      placements: ["wide"],
      referenceSystemVersion: "customermates-marketing-visuals@5",
      selection: "automatic",
      source: {
        ...source,
        checksum: visualSourceChecksum(source.headline, source.body),
      },
    };

    expect(invalid(automaticProof)).toThrow();
  });

  it("accepts approved native fixtures independently of source names and retains seeded pairings", () => {
    const base = getGoldenVisualBrief("converge", "en");
    const sourceIndependent = clone(base);
    const sourceIndependentSubjects = sourceIndependent.supportingSubjects as Array<Record<string, unknown>>;
    sourceIndependentSubjects[0].fixtures = {
      person: "amin-hassan",
      provider: "gmail",
    };
    sourceIndependentSubjects[1].fixtures = { provider: "instagram" };
    sourceIndependentSubjects[2].fixtures = { provider: "telegram" };
    const unknown = clone(base);
    const unknownSubjects = unknown.supportingSubjects as Array<Record<string, unknown>>;
    unknownSubjects[0].fixtures = { person: "anna-mueller", provider: "x" };
    const wrongPair = clone(base);
    const wrongPairSubjects = wrongPair.supportingSubjects as Array<Record<string, unknown>>;
    wrongPairSubjects[0].fixtures = {
      person: "leon-becker",
      provider: "gmail",
    };
    const unmappedPair = clone(base);
    const unmappedPairSubjects = unmappedPair.supportingSubjects as Array<Record<string, unknown>>;
    unmappedPairSubjects[0].fixtures = {
      person: "anna-mueller",
      provider: "outlook",
    };
    const duplicate = clone(base);
    const duplicateSubjects = duplicate.supportingSubjects as Array<Record<string, unknown>>;
    duplicateSubjects[2].id = duplicateSubjects[1].id;

    expect(validateVisualBrief(sourceIndependent)).toMatchObject({
      id: "golden.converge",
      supportingSubjects: [
        { fixtures: { person: "amin-hassan", provider: "gmail" } },
        { fixtures: { provider: "instagram" } },
        { fixtures: { provider: "telegram" } },
      ],
    });
    expect(invalid(unknown)).toThrow();
    expect(invalid(wrongPair)).toThrow(/seeded conversation pairing/u);
    expect(invalid(unmappedPair)).toThrow(/seeded conversation pairing/u);
    expect(invalid(duplicate)).toThrow(/unique stable ID/u);
    for (const asset of APPROVED_NATIVE_VISUAL_ASSETS) {
      expect(existsSync(join(REPO_ROOT, "public", asset))).toBe(true);
    }
  });

  it("accepts seeded records that the source does not name", () => {
    const brief = clone(getGoldenVisualBrief("focus", "en"));
    const focal = brief.focalSubject as Record<string, unknown>;
    focal.fixtures = {
      person: "max-bergmann",
      record: "deal-enterprise-integration",
      status: "deal-won",
    };

    expect(validateVisualBrief(brief)).toMatchObject({
      focalSubject: {
        fixtures: {
          person: "max-bergmann",
          record: "deal-enterprise-integration",
          status: "deal-won",
        },
      },
    });

    const wrongStatus = clone(getGoldenVisualBrief("focus", "en"));
    const wrongStatusFocal = wrongStatus.focalSubject as Record<string, unknown>;
    wrongStatusFocal.fixtures = {
      person: "max-bergmann",
      record: "deal-enterprise-integration",
      status: "deal-open",
    };
    expect(invalid(wrongStatus)).toThrow(/seeded status binding/u);
  });

  it("requires every agent cue to select one approved native provider without inference", () => {
    const base = getGoldenVisualBrief("handoff", "en");
    const missing = clone(base);
    const missingSubjects = missing.supportingSubjects as Array<Record<string, unknown>>;
    delete missingSubjects[0].agentProvider;

    const unsupported = clone(base);
    const unsupportedSubjects = unsupported.supportingSubjects as Array<Record<string, unknown>>;
    unsupportedSubjects[0].agentProvider = "codex";

    const misplaced = clone(base);
    const misplacedSubjects = misplaced.supportingSubjects as Array<Record<string, unknown>>;
    misplacedSubjects[1].agentProvider = "gemini";

    expect(invalid(missing)).toThrow();
    expect(invalid(unsupported)).toThrow();
    expect(invalid(misplaced)).toThrow();

    for (const [agentProvider, fixture] of Object.entries(VISUAL_AGENT_PROVIDER_FIXTURES)) {
      const providerBrief = clone(base);
      const providerSubjects = providerBrief.supportingSubjects as Array<Record<string, unknown>>;
      providerSubjects[0].agentProvider = agentProvider;

      const validated = validateVisualBrief(providerBrief);
      expect(validated.kind).toBe("brand-illustration");
      if (validated.kind !== "brand-illustration") throw new Error("expected brand illustration");
      expect(validated.supportingSubjects[0]).toMatchObject({ agentProvider });
      const markup = renderToStaticMarkup(
        createElement(NativeAgentProviderIdentity, {
          provider: agentProvider as keyof typeof VISUAL_AGENT_PROVIDER_FIXTURES,
        }),
      );
      expect(markup).toContain(`data-native-agent-provider="${agentProvider}"`);
      expect(markup).toContain(fixture.name);
      if (agentProvider === "gemini") expect(markup).toContain("/images/brand/gemini-sparkle.svg");
    }
  });

  it("requires role-compatible people for authored human actions, drafts and records", () => {
    const wrongHumanAction = clone(getGoldenVisualBrief("handoff", "en"));
    const wrongHumanSubjects = wrongHumanAction.supportingSubjects as Array<Record<string, unknown>>;
    wrongHumanSubjects[1].fixtures = { person: "anna-mueller" };

    const wrongDraft = clone(getGoldenVisualBrief("handoff", "en"));
    const wrongDraftFocal = wrongDraft.focalSubject as Record<string, unknown>;
    wrongDraftFocal.fixtures = { person: "max-bergmann" };

    const wrongRecord = clone(getGoldenVisualBrief("converge", "en"));
    const wrongRecordFocal = wrongRecord.focalSubject as Record<string, unknown>;
    wrongRecordFocal.fixtures = { person: "max-bergmann" };

    expect(invalid(wrongHumanAction)).toThrow(/member/u);
    expect(invalid(wrongDraft)).toThrow(/contact/u);
    expect(invalid(wrongRecord)).toThrow(/contact/u);
  });
});

describe("GoldenStoryVisual benchmark renderer", () => {
  it("renders one benchmark for every golden, theme and placement with one focal object and exactly three depth planes", () => {
    for (const pathway of VISUAL_PATHWAYS) {
      const brief = getGoldenVisualBrief(pathway, "en");
      for (const placement of VISUAL_PLACEMENTS) {
        for (const theme of ["light", "dark"] as const) {
          const markup = renderToStaticMarkup(
            createElement(GoldenStoryVisual, {
              brief,
              placement,
              theme,
            }),
          );
          expect(markup.match(/data-focal-object="true"/gu)).toHaveLength(1);
          expect(markup.match(/data-depth-plane="[123]"/gu)).toHaveLength(3);
          expect(markup).toContain(`data-golden-placement="${placement}"`);
          expect(markup).toContain(`data-story-theme="${theme}"`);
          expect(markup).toContain(`data-story-pathway="${pathway}"`);
          expect(markup).not.toMatch(/data-(?:candidate|composition|preferred|selected-variant|study)/u);
        }
      }
    }
  });

  it("keeps source paragraphs out of artwork and uses localized German labels without fallback", () => {
    const converge = getGoldenVisualBrief("converge", "de");
    const handoff = getGoldenVisualBrief("handoff", "de");
    const convergeMarkup = render(converge);
    const handoffMarkup = render(handoff, "split");

    expect(convergeMarkup).toContain("Datensatz");
    expect(convergeMarkup).not.toContain(">Record<");
    expect(convergeMarkup).not.toContain(converge.source.body);
    expect(convergeMarkup).not.toContain(converge.source.headline);
    expect(convergeMarkup).not.toContain("truncate");
    expect(handoffMarkup).toContain("Entwurf");
    expect(handoffMarkup).toContain("Senden");
    expect(handoffMarkup).not.toContain(">Draft<");
    expect(handoffMarkup).not.toContain(">Send<");
    expect(handoffMarkup).not.toContain("truncate");
  });

  it("uses native provider and person fixtures and gives only one Converge source active weight", () => {
    const markup = render(getGoldenVisualBrief("converge", "en"), "wide");

    expect(markup).toContain('data-native-provider="gmail"');
    expect(markup).toContain('data-native-provider="linkedin"');
    expect(markup).toContain('data-native-provider="whatsapp"');
    expect(markup).toContain('data-native-person="anna-mueller"');
    expect(markup).toContain("Anna Müller");
    expect(markup).not.toMatch(/lucide-(?:mail|message-circle|share2|users)/u);
    expect(markup.match(/data-active-source="true"/gu)).toHaveLength(1);
    expect(markup).toContain('data-motion-subject="mail-source"');
    expect(markup).toContain('data-motion-subject="chat-source"');
    expect(markup).toContain('data-motion-subject="network-source"');
  });

  it("uses seeded recipient, sender, record and Status fixtures in the other goldens", () => {
    const handoff = render(getGoldenVisualBrief("handoff", "en"), "wide");
    const focus = render(getGoldenVisualBrief("focus", "en"), "wide");

    expect(handoff).toContain('data-native-provider="linkedin"');
    expect(handoff).toContain('data-native-agent-provider="chatgpt"');
    expect(handoff).toContain('data-native-person="leon-becker"');
    expect(handoff).toContain('data-native-person="max-bergmann"');
    expect(handoff).toContain("Leon Becker");
    expect(handoff).toContain("Max Bergmann");
    expect(handoff).toContain("ChatGPT");
    expect(handoff).not.toContain("lucide-sparkles");
    expect(focus).toContain('data-native-record="deal-crm-rollout"');
    expect(focus).toContain('data-native-status="deal-won"');
    expect(focus).toContain('data-variant="success"');
    expect(focus).toContain("CRM Rollout &amp; Sales Enablement");
  });

  it("recomposes fixture detail from essential to context to full density", () => {
    const converge = Object.fromEntries(
      VISUAL_PLACEMENTS.map((placement) => [placement, render(getGoldenVisualBrief("converge", "en"), placement)]),
    );
    const handoff = Object.fromEntries(
      VISUAL_PLACEMENTS.map((placement) => [placement, render(getGoldenVisualBrief("handoff", "en"), placement)]),
    );
    const focus = Object.fromEntries(
      VISUAL_PLACEMENTS.map((placement) => [placement, render(getGoldenVisualBrief("focus", "en"), placement)]),
    );

    expect(converge.narrow).toContain('data-detail-density="essential"');
    expect(converge.split).toContain('data-detail-density="context"');
    expect(converge.wide).toContain('data-detail-density="full"');
    expect(converge.narrow).not.toContain(">Record<");
    expect(converge.split).toContain(">Record<");
    expect(converge.wide).toContain(">Record<");

    for (const placement of VISUAL_PLACEMENTS) {
      expect(handoff[placement]).toContain('data-native-agent-provider="chatgpt"');
      expect(handoff[placement]).toContain('data-native-provider="linkedin"');
      expect(handoff[placement]).toContain('data-native-person="leon-becker"');
      expect(handoff[placement]).toContain('data-native-person="max-bergmann"');
      expect(handoff[placement]).toContain(">Send<");
    }
    expect(handoff.narrow.match(/bg-placeholder/gu) ?? []).toHaveLength(0);
    expect(handoff.split.match(/bg-placeholder/gu)).toHaveLength(1);
    expect(handoff.wide.match(/bg-placeholder/gu)).toHaveLength(3);

    expect(focus.narrow).not.toContain('data-inspector-cue="true"');
    expect(focus.split).toContain('data-inspector-cue="true"');
    expect(focus.split).not.toContain(">Inspector<");
    expect(focus.wide).toContain(">Inspector<");
    expect(focus.narrow).not.toContain('data-native-record="deal-data-analytics"');
    expect(focus.split).toContain('data-native-record="deal-data-analytics"');
    expect(focus.split).not.toContain('data-native-record="deal-process-automation"');
    expect(focus.wide).toContain('data-native-record="deal-process-automation"');
  });

  it("renders deterministic Converge opening, transition and resolved states while defaulting to the poster", () => {
    const brief = getGoldenVisualBrief("converge", "en");
    const opening = renderToStaticMarkup(
      createElement(GoldenStoryVisual, {
        brief,
        placement: "wide",
        t: 0,
        theme: "dark",
      }),
    );
    const transition = renderToStaticMarkup(
      createElement(GoldenStoryVisual, {
        brief,
        placement: "wide",
        t: 0.5,
        theme: "dark",
      }),
    );
    const resolved = renderToStaticMarkup(
      createElement(GoldenStoryVisual, {
        brief,
        placement: "wide",
        t: 1,
        theme: "dark",
      }),
    );
    const poster = renderToStaticMarkup(
      createElement(GoldenStoryVisual, {
        brief,
        placement: "wide",
        theme: "dark",
      }),
    );

    expect(opening).toContain('data-motion-progress="0.000"');
    expect(transition).not.toBe(opening);
    expect(transition).not.toBe(resolved);
    expect(transition).toBe(
      renderToStaticMarkup(
        createElement(GoldenStoryVisual, {
          brief,
          placement: "wide",
          t: 0.5,
          theme: "dark",
        }),
      ),
    );
    expect(resolved).toContain('data-motion-progress="1.000"');
    expect(poster).toBe(resolved);
  });

  it("rejects generic content disguised with a golden ID and source checksum", () => {
    const input = clone(getGoldenVisualBrief("converge", "en"));
    input.supportingSubjects = (input.supportingSubjects as BrandIllustrationBrief["supportingSubjects"]).slice(0, 2);
    const brief = validateVisualBrief(input) as GoldenVisualBrief;

    expect(() => render(brief)).toThrow(/exactly match the registered golden benchmark/u);
  });

  it("rejects product proof and out-of-range normalized time", () => {
    const source = {
      body: "A reachable local capture.",
      headline: "Local product proof",
    };
    const proof = validateVisualBrief({
      capture: {
        localPath: "/captures/light/inbox.png",
        reachableStateReference: "fixture.inbox",
      },
      id: "proof.inbox",
      kind: "product-proof",
      locale: "en",
      placements: ["wide"],
      referenceSystemVersion: "customermates-marketing-visuals@5",
      selection: "explicit",
      source: {
        ...source,
        checksum: visualSourceChecksum(source.headline, source.body),
      },
    }) as ProductProofBrief;
    const brief = getGoldenVisualBrief("focus", "en");

    expect(() =>
      renderToStaticMarkup(
        createElement(GoldenStoryVisual, {
          brief: proof as unknown as GoldenVisualBrief,
          placement: "wide",
          theme: "light",
        }),
      ),
    ).toThrow(/Golden visuals must be brand illustrations/u);
    for (const invalidTime of [-0.1, 1.1, Number.NaN, Number.NEGATIVE_INFINITY, Number.POSITIVE_INFINITY]) {
      expect(() =>
        renderToStaticMarkup(
          createElement(GoldenStoryVisual, {
            brief,
            placement: "wide",
            t: invalidTime,
            theme: "light",
          }),
        ),
      ).toThrow(/normalized/u);
    }
  });
});

describe("golden benchmark connector geometry and motion", () => {
  it("authors exact Converge and Handoff ports on each focal border", () => {
    const expectedConverge = {
      narrow: {
        focal: { width: 88, x: 24, y: 41.75 },
        targets: [
          { x: 38, y: 41.75 },
          { x: 50, y: 41.75 },
          { x: 62, y: 41.75 },
        ],
      },
      split: {
        focal: { width: 86, x: 24, y: 49.5 },
        targets: [
          { x: 38, y: 49.5 },
          { x: 50, y: 49.5 },
          { x: 62, y: 49.5 },
        ],
      },
      wide: {
        focal: { width: 49, x: 55, y: 17 },
        targets: [
          { x: 55, y: 35 },
          { x: 55, y: 50 },
          { x: 55, y: 65 },
        ],
      },
    } as const;
    const expectedHandoff = {
      narrow: {
        focal: { width: 88, x: 10, y: 43.5 },
        target: { x: 35, y: 43.5 },
      },
      split: {
        focal: { width: 86, x: 11, y: 49.5 },
        target: { x: 35, y: 49.5 },
      },
      wide: {
        focal: { width: 49, x: 48, y: 17 },
        target: { x: 48, y: 35 },
      },
    } as const;

    for (const placement of VISUAL_PLACEMENTS) {
      const converge = GOLDEN_LAYOUT.converge[placement];
      const convergeTargets = converge.connectors[3].map(({ target }) => target);
      const handoff = GOLDEN_LAYOUT.handoff[placement];

      expect({ focal: converge.focal, targets: convergeTargets }).toEqual(expectedConverge[placement]);
      expect(connectorTargetViolations(placement, converge.focal, convergeTargets)).toEqual([]);
      expect({
        focal: handoff.focal,
        target: handoff.connector.target,
      }).toEqual(expectedHandoff[placement]);
      expect(connectorTargetViolations(placement, handoff.focal, [handoff.connector.target])).toEqual([]);
    }
  });

  it("detects a planted connector target that misses its authored border", () => {
    const { connector, focal } = GOLDEN_LAYOUT.handoff.wide;
    const misalignedTarget = { ...connector.target, x: connector.target.x + 1 };

    expect(connectorTargetViolations("wide", focal, [misalignedTarget])).toEqual([
      "connector 1 misses wide focal border",
    ]);
  });

  it("trims solid connector prefixes monotonically and resolves on the authored target", () => {
    const samples = [0, 0.1, 0.22, 0.34, 0.5, 0.56, 0.62, STORY_VISUAL_MOTION.resolvedStart, 1];

    for (const index of [0, 1, 2]) {
      const progress = samples.map((time) => connectorDrawProgress(time, index));

      expect(progress[0]).toBe(0);
      expect(progress.at(-1)).toBe(1);
      expect(progress.every((value, sampleIndex) => sampleIndex === 0 || value >= progress[sampleIndex - 1]!)).toBe(
        true,
      );
      expect(connectorDrawProgress(STORY_VISUAL_MOTION.resolvedStart, index)).toBe(1);

      const connector = GOLDEN_LAYOUT.converge.wide.connectors[3][index];
      if (!connector) throw new Error(`missing connector ${index + 1}`);
      const prefixes = progress.map((value) => ({
        progress: value,
        target: trimAuthoredConnector(connector, value).target,
      }));
      expect(connectorPrefixViolations(connector, prefixes)).toEqual([]);
    }

    const brief = getGoldenVisualBrief("converge", "en");
    const renderAt = (t: number) =>
      renderToStaticMarkup(
        createElement(GoldenStoryVisual, {
          brief,
          placement: "wide",
          t,
          theme: "dark",
        }),
      );
    const openingPaths = connectorPathTags(renderAt(0));
    const transitionPaths = connectorPathTags(renderAt(0.4));
    const resolvedPaths = connectorPathTags(renderAt(STORY_VISUAL_MOTION.resolvedStart));

    expect(openingPaths).toHaveLength(3);
    GOLDEN_LAYOUT.converge.wide.connectors[3].forEach((connector, index) => {
      expect(openingPaths[index]).toContain(`d="${authoredConnectorPath(connector, 0)}"`);
      expect(openingPaths[index]).toContain(`data-connector-draw-target="${connector.source.x},${connector.source.y}"`);

      const transition = trimAuthoredConnector(connector, connectorDrawProgress(0.4, index));
      expect(transition.target.x).toBeLessThan(connector.target.x);
      expect(transitionPaths[index]).toContain(
        `data-connector-draw-target="${transition.target.x},${transition.target.y}"`,
      );

      expect(resolvedPaths[index]).toContain(`d="${authoredConnectorPath(connector)}"`);
      expect(resolvedPaths[index]).toContain(
        `data-connector-draw-target="${connector.target.x},${connector.target.y}"`,
      );
    });
  });

  it("detects planted retreating and incomplete connector prefixes", () => {
    const connector = GOLDEN_LAYOUT.converge.wide.connectors[3][0];
    const planted = [0, 0.7, 0.35, 0.9].map((progress) => ({
      progress,
      target: trimAuthoredConnector(connector, progress).target,
    }));

    expect(connectorPrefixViolations(connector, planted)).toEqual([
      "connector prefix target retreats",
      "resolved prefix misses authored target",
    ]);
  });

  it("renders only the connectors authored for each golden and keeps Focus connector-free", () => {
    expect(goldenConnectorCount("converge", 3)).toBe(3);
    expect(goldenConnectorCount("handoff", 2)).toBe(1);
    expect(goldenConnectorCount("focus", 2)).toBe(0);

    for (const placement of VISUAL_PLACEMENTS) {
      expect(connectorPathTags(render(getGoldenVisualBrief("focus", "en"), placement))).toHaveLength(0);
    }
  });

  it("uses one solid butt-capped SVG prefix per connector without dash or ghost paths", () => {
    const markup = render(getGoldenVisualBrief("converge", "en"), "wide");
    const paths = connectorPathTags(markup);

    expect(paths).toHaveLength(3);
    for (const path of paths) {
      expect(path).toContain('pathLength="1"');
      expect(path).toContain('stroke-linecap="butt"');
      expect(path).toContain('vector-effect="non-scaling-stroke"');
      expect(path).not.toMatch(/stroke-dash(?:array|offset)/u);
    }
    expect(markup).not.toMatch(/stroke-dash(?:array|offset)/u);
    expect(markup.match(/data-motion-subject="connector-/gu)).toHaveLength(3);
  });

  it("keeps connector geometry deterministic and free of DOM measurement", () => {
    const sources = ["story-visual.tsx", "story-visual-layout.ts"].map((file) =>
      readFileSync(join(REPO_ROOT, "components", "marketing", "visuals", file), "utf8"),
    );

    expect(sources.join("\n")).not.toMatch(
      /getBoundingClientRect|ResizeObserver|useLayoutEffect|offsetWidth|offsetHeight|clientWidth|clientHeight/u,
    );
  });
});

describe("marketing visual boundaries", () => {
  it("keeps product screens and UI chrome out while reusing only the approved native AI identity primitive", () => {
    expect(rendererBoundaryViolations('import { Button } from "@/components/ui/button";')).toEqual(["/components/ui/"]);
    expect(rendererBoundaryViolations('import { Dashboard } from "@/app/[locale]/(protected)/dashboard";')).toEqual([
      "/(protected)/",
    ]);

    const directory = join(REPO_ROOT, "components", "marketing", "visuals");
    const files = readdirSync(directory).filter((file) => /\.tsx?$/u.test(file));
    const sources = files.map((file) => readFileSync(join(directory, file), "utf8"));
    expect(sources.flatMap(rendererBoundaryViolations)).toEqual([]);
    expect(
      files.filter((file, index) => sources[index]?.includes("@/components/ai-connection/ai-client-logo")),
    ).toEqual(["native-visual-primitives.tsx"]);
    expect(sources.join("\n")).not.toMatch(/requestAnimationFrame|setInterval|<animate/u);
  });

  it("detects planted proof rendering and keeps proof outside GoldenStoryVisual", () => {
    expect(productProofRendererViolations('const kind = "product-proof"; return <GoldenStoryVisual />;')).toEqual([
      "product-proof uses GoldenStoryVisual",
    ]);

    const directory = join(REPO_ROOT, "components", "marketing", "visuals");
    const violations = readdirSync(directory)
      .filter((file) => file.includes("product-proof"))
      .flatMap((file) => productProofRendererViolations(readFileSync(join(directory, file), "utf8")));
    expect(violations).toEqual([]);
  });

  it("keeps the authoring command local, deterministic and model-free", () => {
    const script = readFileSync(join(REPO_ROOT, "scripts", "render-marketing-visual-review.ts"), "utf8");
    expect(script).toContain('resolve("public")');
    expect(script).toContain('resolve("app")');
    expect(script).toContain("Choose exactly one of --input or --golden");
    expect(script).toContain("GoldenBenchmarkReviewSheet");
    expect(script).toContain("VisualBriefReferenceSheet");
    expect(script).not.toMatch(/values\.golden\s*\?\?\s*["']converge["']/u);
    expect(script).not.toMatch(/openai|anthropic|replicate|fetch\s*\(/u);
  });

  it("publishes the local fixture catalogue as the guide's discovery path", () => {
    const chapter = readFileSync(
      join(REPO_ROOT, "app", "[locale]", "(static)", "styleguide", "components", "visuals-chapter.tsx"),
      "utf8",
    );

    expect(chapter).toContain("yarn marketing:visual-catalog");
    expect(chapter).toContain("never queries a runtime database");
  });

  it("keeps layout selection out of the generic and golden public APIs", () => {
    const contract = readFileSync(join(REPO_ROOT, "components", "marketing", "visuals", "visual-contract.ts"), "utf8");
    const goldens = readFileSync(join(REPO_ROOT, "components", "marketing", "visuals", "goldens.ts"), "utf8");
    const renderer = readFileSync(join(REPO_ROOT, "components", "marketing", "visuals", "story-visual.tsx"), "utf8");
    const publicApi = readFileSync(join(REPO_ROOT, "components", "marketing", "visuals", "index.ts"), "utf8");

    expect(contract).toContain('VISUAL_PATHWAYS = ["converge", "handoff", "focus"]');
    expect(contract).not.toMatch(/DEFAULT_VISUAL_VARIANT|VISUAL_VARIANTS|VisualVariant|selectedVariant\s*:/u);
    expect(goldens).not.toMatch(
      /GOLDEN_(?:COMPOSITION|PREFERRED)|Golden(?:Candidate|Composition|Study|Variant)|getGoldenComposition/u,
    );
    expect(renderer).not.toMatch(/\b(?:candidate|composition|preferred|study|variant)\s*:/u);
    expect(publicApi).toContain("GoldenStoryVisual");
    expect(publicApi).toContain("GoldenBenchmarkReviewSheet");
    expect(publicApi).toContain("VISUAL_PATHWAYS");
    expect(publicApi).not.toMatch(/export\s*\{\s*StoryVisual\s*\}/u);
    expect(publicApi).not.toMatch(/Candidate|Composition|Preferred|Study|Variant|GOLDEN_(?:COMPOSITION|PREFERRED)/u);
  });

  it("embeds only approved local visual assets in standalone review markup", async () => {
    const markup = render(getGoldenVisualBrief("converge", "en"));
    const inlined = await inlineApprovedVisualAssets(markup);

    expect(inlined).toContain("data:image/svg+xml;base64,");
    expect(inlined).toContain("data:image/png;base64,");
    expect(inlined).not.toMatch(/\/(?:icons\/channels|demo\/avatars\/photos)\//u);
  });

  it("embeds the exact local review fonts without an external font request", async () => {
    const stylesheet = await inlineReviewFonts("body{font-family:var(--font-family-sans)}");

    expect(stylesheet.match(/data:font\/woff2;base64,/gu)).toHaveLength(2);
    expect(stylesheet).toContain('--font-sans:"Customermates Review Sans"');
    expect(stylesheet).toContain('--font-mono:"Customermates Review Mono"');
    expect(stylesheet).not.toMatch(/https?:|url\(["']?\//u);
  });

  it("keeps native fixture values closed and source-backed", () => {
    expect(Object.keys(VISUAL_AGENT_PROVIDER_FIXTURES)).toEqual(["chatgpt", "claude", "cursor", "gemini"]);
    expect(Object.keys(VISUAL_PROVIDER_FIXTURES)).toEqual([
      "gmail",
      "imap",
      "instagram",
      "linkedin",
      "outlook",
      "telegram",
      "whatsapp",
    ]);
    expect(VISUAL_PERSON_FIXTURES["anna-mueller"].name).toBe("Anna Müller");
    expect(VISUAL_RECORD_FIXTURES["deal-crm-rollout"]).toMatchObject({
      kind: "deal",
      name: "CRM Rollout & Sales Enablement",
      status: "deal-won",
    });
    expect(Object.values(VISUAL_STATUS_FIXTURES).map(({ label, variant }) => [label, variant])).toEqual([
      ["Open", "warning"],
      ["Won", "success"],
      ["Lost", "destructive"],
      ["Abandoned", "secondary"],
    ]);
    expect(NATIVE_VISUAL_FIXTURE_SOURCES.filter((source) => !existsSync(join(REPO_ROOT, source)))).toEqual([]);
  });
});
