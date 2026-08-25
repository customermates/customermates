import {
  type BrandIllustrationBrief,
  type VisualLocale,
  type VisualTemplate,
  DEFAULT_VISUAL_VARIANT,
  VISUAL_REFERENCE_SYSTEM_VERSION,
  validateVisualBrief,
  visualSourceChecksum,
} from "./visual-contract";

type GoldenCopy = {
  body: string;
  focalLabel: string;
  headline: string;
  semanticLabels: string[];
  takeaway: string;
};

type GoldenDefinition = {
  accentTarget: string;
  copy: Record<VisualLocale, GoldenCopy>;
  depictionKind: "relationship" | "change" | "result";
  factReference:
    | "product:conversation-record-association"
    | "product:deal-status-field"
    | "product:human-send-boundary"
    | "product:record-activity-context";
  focalSubject: BrandIllustrationBrief["focalSubject"];
  id: string;
  supportingSubjects: BrandIllustrationBrief["supportingSubjects"];
  template: VisualTemplate;
};

const GOLDEN_DEFINITIONS: Record<VisualTemplate, GoldenDefinition> = {
  converge: {
    accentTarget: "customer-record",
    copy: {
      de: {
        body: "Eine Gmail-Unterhaltung von Anna Müller wird mit ihrem Kundendatensatz verknüpft; LinkedIn und WhatsApp bleiben als weitere unterstützte Quellen ruhig.",
        focalLabel: "Datensatz",
        headline: "Unterhaltungen gehören zu Kundendatensätzen",
        semanticLabels: [],
        takeaway: "Jede Unterhaltung landet bei dem Datensatz, zu dem sie gehört.",
      },
      en: {
        body: "A Gmail conversation from Anna Müller is associated with her customer record while LinkedIn and WhatsApp remain quiet supported sources.",
        focalLabel: "Record",
        headline: "Conversations belong to customer records",
        semanticLabels: [],
        takeaway: "Every conversation lands on the record it belongs to.",
      },
    },
    depictionKind: "relationship",
    factReference: "product:conversation-record-association",
    focalSubject: {
      fixtures: { person: "anna-mueller" },
      form: "record",
      id: "customer-record",
    },
    id: "golden.converge",
    supportingSubjects: [
      {
        fixtures: { person: "anna-mueller", provider: "gmail" },
        form: "channel-mark",
        id: "mail-source",
      },
      {
        fixtures: { provider: "linkedin" },
        form: "channel-mark",
        id: "network-source",
      },
      {
        fixtures: { provider: "whatsapp" },
        form: "channel-mark",
        id: "chat-source",
      },
    ],
    template: "converge",
  },
  focus: {
    accentTarget: "quiet-signal",
    copy: {
      de: {
        body: "Max Bergmann prüft CRM Rollout & Sales Enablement, das auf Won steht; Data & Analytics Transformation bleibt auf Open und Process Automation Program auf Lost im ruhigen Kontext.",
        focalLabel: "Signal",
        headline: "Ein relevantes Signal tritt hervor",
        semanticLabels: ["Prüfer"],
        takeaway: "Ein leises Signal wird klar genug, um zu handeln.",
      },
      en: {
        body: "Max Bergmann inspects CRM Rollout & Sales Enablement, which is Won, while Data & Analytics Transformation stays Open and Process Automation Program stays Lost in the quiet context.",
        focalLabel: "Signal",
        headline: "A relevant signal comes into focus",
        semanticLabels: ["Inspector"],
        takeaway: "One quiet signal becomes clear enough to act on.",
      },
    },
    depictionKind: "result",
    factReference: "product:deal-status-field",
    focalSubject: {
      fixtures: {
        person: "max-bergmann",
        record: "deal-crm-rollout",
        status: "deal-won",
      },
      form: "signal",
      id: "quiet-signal",
    },
    id: "golden.focus",
    supportingSubjects: [
      {
        fixtures: {
          record: "deal-data-analytics",
          status: "deal-open",
        },
        form: "context-card",
        id: "quiet-context",
      },
      {
        fixtures: {
          record: "deal-process-automation",
          status: "deal-lost",
        },
        form: "context-card",
        id: "lost-context",
      },
    ],
    template: "focus",
  },
  handoff: {
    accentTarget: "human-action",
    copy: {
      de: {
        body: "ChatGPT bereitet einen LinkedIn-Entwurf für Leon Becker vor; Max Bergmann prüft und sendet ihn.",
        focalLabel: "Entwurf",
        headline: "Der Mensch behält den letzten Schritt",
        semanticLabels: ["Senden"],
        takeaway: "ChatGPT entwirft; der Mensch sendet.",
      },
      en: {
        body: "ChatGPT prepares a LinkedIn draft for Leon Becker; Max Bergmann reviews and sends it.",
        focalLabel: "Draft",
        headline: "The human keeps the final step",
        semanticLabels: ["Send"],
        takeaway: "ChatGPT drafts; the human sends.",
      },
    },
    depictionKind: "change",
    factReference: "product:human-send-boundary",
    focalSubject: {
      fixtures: { person: "leon-becker", provider: "linkedin" },
      form: "draft",
      id: "message-draft",
    },
    id: "golden.handoff",
    supportingSubjects: [
      { agentProvider: "chatgpt", form: "agent-cue", id: "agent-cue" },
      {
        fixtures: { person: "max-bergmann" },
        form: "human-action",
        id: "human-action",
      },
    ],
    template: "handoff",
  },
};

function buildGolden(definition: GoldenDefinition, locale: VisualLocale): BrandIllustrationBrief {
  const copy = definition.copy[locale];
  const brief = validateVisualBrief({
    accentTarget: definition.accentTarget,
    depiction: {
      kind: definition.depictionKind,
      productBehavior: true,
      statement: copy.takeaway,
    },
    factReferences: [definition.factReference],
    focalLabel: { locale, text: copy.focalLabel },
    focalSubject: definition.focalSubject,
    id: definition.id,
    kind: "brand-illustration",
    locale,
    placements: ["wide", "split", "narrow"],
    referenceSystemVersion: VISUAL_REFERENCE_SYSTEM_VERSION,
    selectedVariant: DEFAULT_VISUAL_VARIANT,
    selection: "automatic",
    semanticLabels: copy.semanticLabels.map((text) => ({ locale, text })),
    source: {
      body: copy.body,
      checksum: visualSourceChecksum(copy.headline, copy.body),
      headline: copy.headline,
    },
    supportingSubjects: definition.supportingSubjects,
    takeaway: copy.takeaway,
    template: definition.template,
  });
  if (brief.kind !== "brand-illustration") throw new Error(`${definition.id} did not produce a brand illustration`);
  return brief;
}

export const GOLDEN_VISUAL_BRIEFS = Object.fromEntries(
  Object.entries(GOLDEN_DEFINITIONS).map(([template, definition]) => [
    template,
    {
      de: buildGolden(definition, "de"),
      en: buildGolden(definition, "en"),
    },
  ]),
) as Record<VisualTemplate, Record<VisualLocale, BrandIllustrationBrief>>;

export function getGoldenVisualBrief(template: VisualTemplate, locale: VisualLocale) {
  return GOLDEN_VISUAL_BRIEFS[template][locale];
}
