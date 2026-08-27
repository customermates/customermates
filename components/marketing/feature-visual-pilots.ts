import { isContentLocale, type ContentLocale } from "@/i18n/locale-registry";

import {
  VISUAL_REFERENCE_SYSTEM_VERSION,
  type BrandIllustrationBrief,
  validateVisualBrief,
  visualSourceChecksum,
} from "./visuals/visual-contract";

export const FEATURE_VISUAL_PILOT_SLUGS = ["email-integration", "pipeline"] as const;

export type FeatureVisualPilotSlug = (typeof FEATURE_VISUAL_PILOT_SLUGS)[number];
export type FeatureVisualPilotPattern = "S-03" | "S-04";

export type FeatureVisualPilotSource = {
  featureName: string;
  hero: {
    description: string;
    title: string;
  };
  visualSection?: {
    description: string;
    labels: {
      focal: string;
      semantic: [string, string];
    };
    title: string;
  };
};

export type FeatureVisualPilot = {
  brief: BrandIllustrationBrief;
  copy: {
    description: string;
    eyebrow: string;
    title: string;
  };
  locale: ContentLocale;
  patternId: FeatureVisualPilotPattern;
  sectionId: string;
  slug: FeatureVisualPilotSlug;
  tone: "inverse";
};

type PilotDefinition = {
  accentTarget: string;
  depictionKind: "change" | "relationship" | "result";
  factReferences: readonly BrandIllustrationBrief["factReferences"][number][];
  focalSubject: BrandIllustrationBrief["focalSubject"];
  id: string;
  pathway: "converge" | "focus" | "handoff";
  patternId: FeatureVisualPilotPattern;
  sectionId: string;
  slug: FeatureVisualPilotSlug;
  sourceChecksum: Record<ContentLocale, `fnv1a-${string}`>;
  supportingSubjects: BrandIllustrationBrief["supportingSubjects"];
};

export const FEATURE_VISUAL_PILOT_REGISTRY: Record<FeatureVisualPilotSlug, PilotDefinition> = {
  "email-integration": {
    accentTarget: "customer-record",
    depictionKind: "relationship",
    factReferences: ["product:conversation-record-association", "product:unified-inbox-channel-set"],
    focalSubject: {
      fixtures: { conversation: "gmail-roche-rollout", person: "anna-mueller" },
      form: "record",
      id: "customer-record",
    },
    id: "pilot.email-integration.converge",
    pathway: "converge",
    patternId: "S-03",
    sectionId: "feature-pilot-email-record",
    slug: "email-integration",
    sourceChecksum: {
      de: "fnv1a-1c0e9454",
      en: "fnv1a-29a2e0a2",
    },
    supportingSubjects: [
      {
        fixtures: { providerSet: "unified-inbox" },
        form: "provider-set",
        id: "unified-inbox-providers",
      },
    ],
  },
  pipeline: {
    accentTarget: "dragged-deal",
    depictionKind: "change",
    factReferences: ["product:deal-kanban-movement", "product:deal-status-field", "product:deal-weighted-values"],
    focalSubject: {
      fixtures: {
        person: "max-bergmann",
        record: "deal-digital-customer-platform",
        status: "deal-open",
      },
      form: "signal",
      id: "dragged-deal",
    },
    id: "pilot.pipeline.handoff",
    pathway: "handoff",
    patternId: "S-04",
    sectionId: "feature-pilot-pipeline-status",
    slug: "pipeline",
    sourceChecksum: {
      de: "fnv1a-9cd5a0b7",
      en: "fnv1a-d5d37a71",
    },
    supportingSubjects: [
      {
        fixtures: { dealBoard: "demo-status-board" },
        form: "kanban-board",
        id: "deal-board",
      },
      {
        fixtures: { person: "max-bergmann" },
        form: "human-action",
        id: "drag-action",
      },
    ],
  },
};

function buildPilot(
  definition: PilotDefinition,
  locale: ContentLocale,
  source: FeatureVisualPilotSource,
): FeatureVisualPilot {
  if (!source.visualSection?.labels)
    throw new Error(`${definition.slug} needs localized visualSection copy and rendered labels`);

  const actualChecksum = visualSourceChecksum(source.hero.title, source.hero.description);
  const expectedChecksum = definition.sourceChecksum[locale];
  if (actualChecksum !== expectedChecksum)
    throw new Error(`${definition.slug} ${locale} source changed; review and record ${actualChecksum}`);

  const brief = validateVisualBrief({
    accentTarget: definition.accentTarget,
    depiction: {
      kind: definition.depictionKind,
      productBehavior: true,
      statement: source.visualSection.title,
    },
    factReferences: definition.factReferences,
    focalLabel: { locale, text: source.visualSection.labels.focal },
    focalSubject: definition.focalSubject,
    id: definition.id,
    kind: "brand-illustration",
    locale,
    pathway: definition.pathway,
    placements: ["split"],
    referenceSystemVersion: VISUAL_REFERENCE_SYSTEM_VERSION,
    selection: "automatic",
    semanticLabels: source.visualSection.labels.semantic.map((text) => ({
      locale,
      text,
    })),
    source: {
      body: source.hero.description,
      checksum: expectedChecksum,
      headline: source.hero.title,
    },
    supportingSubjects: definition.supportingSubjects,
    takeaway: source.visualSection.title,
  });
  if (brief.kind !== "brand-illustration") throw new Error(`${definition.id} is not a brand illustration`);

  return {
    brief,
    copy: {
      description: source.visualSection.description,
      eyebrow: source.featureName,
      title: source.visualSection.title,
    },
    locale,
    patternId: definition.patternId,
    sectionId: definition.sectionId,
    slug: definition.slug,
    tone: "inverse",
  };
}

export function getFeatureVisualPilot(
  slug: string,
  locale: string,
  source: FeatureVisualPilotSource,
): FeatureVisualPilot | null {
  if (!FEATURE_VISUAL_PILOT_SLUGS.includes(slug as FeatureVisualPilotSlug)) return null;
  if (!isContentLocale(locale)) return null;

  return buildPilot(FEATURE_VISUAL_PILOT_REGISTRY[slug as FeatureVisualPilotSlug], locale, source);
}
