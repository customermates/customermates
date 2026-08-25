import { z } from "zod";

import { CONTENT_LOCALES, isContentLocale, type ContentLocale } from "@/i18n/locale-registry";

import {
  VISUAL_AGENT_PROVIDER_FIXTURES,
  VISUAL_PERSON_FIXTURES,
  VISUAL_PROVIDER_FIXTURES,
  VISUAL_PROVIDER_PERSON_PAIRINGS,
  VISUAL_RECORD_FIXTURES,
  VISUAL_STATUS_FIXTURES,
} from "./native-fixtures";

export const VISUAL_REFERENCE_SYSTEM_VERSION = "customermates-marketing-visuals@4";

export const VISUAL_KINDS = ["brand-illustration", "product-proof", "none"] as const;
export const VISUAL_TEMPLATES = ["converge", "handoff", "focus"] as const;
export const VISUAL_VARIANTS = ["edge", "overlap", "stage"] as const;
export const DEFAULT_VISUAL_VARIANT = "edge";
export const VISUAL_PLACEMENTS = ["wide", "split", "narrow"] as const;
export const VISUAL_LOCALES = CONTENT_LOCALES;

export const SUPPORTED_VISUAL_FACTS = [
  "product:conversation-record-association",
  "product:deal-status-field",
  "product:human-send-boundary",
  "product:record-activity-context",
] as const;

export type VisualKind = (typeof VISUAL_KINDS)[number];
export type VisualTemplate = (typeof VISUAL_TEMPLATES)[number];
export type VisualVariant = (typeof VISUAL_VARIANTS)[number];
export type VisualPlacement = (typeof VISUAL_PLACEMENTS)[number];
export type VisualLocale = ContentLocale;

const VisualLocaleSchema = z.custom<ContentLocale>(isContentLocale, {
  message: "locale must publish content",
});
const VisualPlacementSchema = z.enum(VISUAL_PLACEMENTS);
const VisualVariantSchema = z.enum(VISUAL_VARIANTS);
const VisualTemplateSchema = z.enum(VISUAL_TEMPLATES);
const FactReferenceSchema = z.enum(SUPPORTED_VISUAL_FACTS);
const enumKeys = <T extends Record<string, unknown>>(value: T) =>
  Object.keys(value) as [keyof T & string, ...(keyof T & string)[]];
const PersonFixtureSchema = z.enum(enumKeys(VISUAL_PERSON_FIXTURES));
const AgentProviderFixtureSchema = z.enum(enumKeys(VISUAL_AGENT_PROVIDER_FIXTURES));
const ProviderFixtureSchema = z.enum(enumKeys(VISUAL_PROVIDER_FIXTURES));
const RecordFixtureSchema = z.enum(enumKeys(VISUAL_RECORD_FIXTURES));
const StatusFixtureSchema = z.enum(enumKeys(VISUAL_STATUS_FIXTURES));

const HANDOFF_LABELS: Record<ContentLocale, { focal: string; semantic: string }> = {
  de: { focal: "Entwurf", semantic: "Senden" },
  en: { focal: "Draft", semantic: "Send" },
};

const identifier = z.string().regex(/^[a-z0-9]+(?:[.-][a-z0-9]+)*$/u);
const shortStatement = z
  .string()
  .trim()
  .min(1)
  .max(140)
  .refine((value) => !value.includes("\n"));
const shortLabel = z
  .string()
  .trim()
  .min(1)
  .max(24)
  .refine((value) => value.split(/\s+/u).length <= 3);

const LocalizedLabelSchema = z.strictObject({
  locale: VisualLocaleSchema,
  text: shortLabel,
});

const SourceCopySchema = z.strictObject({
  body: z.string().trim().min(1).max(800),
  checksum: z.string().regex(/^fnv1a-[0-9a-f]{8}$/u),
  headline: z.string().trim().min(1).max(180),
});

const SubjectFixtureSchema = z.strictObject({
  person: PersonFixtureSchema.optional(),
  provider: ProviderFixtureSchema.optional(),
  record: RecordFixtureSchema.optional(),
  status: StatusFixtureSchema.optional(),
});

const AgentCueSubjectSchema = z.strictObject({
  agentProvider: AgentProviderFixtureSchema,
  fixtures: z.never().optional(),
  form: z.literal("agent-cue"),
  id: identifier,
});

const FixtureSubjectSchema = z.strictObject({
  fixtures: SubjectFixtureSchema.optional(),
  form: z.enum(["record", "draft", "signal", "channel-mark", "human-action", "context-card", "trace"]),
  id: identifier,
});

const SubjectSchema = z.discriminatedUnion("form", [AgentCueSubjectSchema, FixtureSubjectSchema]);

const DepictionSchema = z.strictObject({
  kind: z.enum(["relationship", "change", "result"]),
  productBehavior: z.boolean(),
  statement: shortStatement,
});

const CommonBriefSchema = z.strictObject({
  id: identifier,
  locale: VisualLocaleSchema,
  referenceSystemVersion: z.literal(VISUAL_REFERENCE_SYSTEM_VERSION),
  source: SourceCopySchema,
});

const BrandIllustrationBriefSchema = CommonBriefSchema.extend({
  accentTarget: identifier,
  depiction: DepictionSchema,
  factReferences: z.array(FactReferenceSchema).max(SUPPORTED_VISUAL_FACTS.length),
  focalLabel: LocalizedLabelSchema.optional(),
  focalSubject: SubjectSchema,
  kind: z.literal("brand-illustration"),
  placements: z.array(VisualPlacementSchema).min(1).max(VISUAL_PLACEMENTS.length),
  selectedVariant: VisualVariantSchema.nullable(),
  selection: z.literal("automatic"),
  semanticLabels: z.array(LocalizedLabelSchema).max(2),
  supportingSubjects: z.array(SubjectSchema).max(3),
  takeaway: shortStatement,
  template: VisualTemplateSchema,
});

const ProductProofBriefSchema = CommonBriefSchema.extend({
  capture: z.strictObject({
    localPath: z.string().regex(/^\/captures\/(?:light|dark)\/[a-z0-9-]+\.png$/u),
    reachableStateReference: identifier,
  }),
  kind: z.literal("product-proof"),
  placements: z.array(VisualPlacementSchema).min(1).max(VISUAL_PLACEMENTS.length),
  selection: z.literal("explicit"),
});

const NoVisualBriefSchema = CommonBriefSchema.extend({
  kind: z.literal("none"),
  reason: shortStatement,
  selection: z.enum(["automatic", "explicit"]),
});

const BaseVisualBriefSchema = z.discriminatedUnion("kind", [
  BrandIllustrationBriefSchema,
  ProductProofBriefSchema,
  NoVisualBriefSchema,
]);

function hasNumber(value: string) {
  return /\p{N}/u.test(value);
}

function addIssue(context: z.core.$RefinementCtx, path: PropertyKey[], message: string) {
  context.addIssue({ code: "custom", message, path });
}

export const VisualBriefSchema = BaseVisualBriefSchema.superRefine((brief, context) => {
  const checksum = visualSourceChecksum(brief.source.headline, brief.source.body);
  if (brief.source.checksum !== checksum)
    addIssue(context, ["source", "checksum"], `expected source checksum ${checksum}`);

  if (brief.kind !== "brand-illustration") return;

  const labels = [brief.focalLabel, ...brief.semanticLabels].filter((label) => label !== undefined);
  for (const [index, label] of labels.entries()) {
    if (label.locale !== brief.locale)
      addIssue(context, ["semanticLabels", index, "locale"], "every rendered label must match the brief locale");
  }

  const subjectIds = [brief.focalSubject.id, ...brief.supportingSubjects.map((subject) => subject.id)];
  if (new Set(subjectIds).size !== subjectIds.length)
    addIssue(context, ["supportingSubjects"], "every subject needs a unique stable ID");

  if (!subjectIds.includes(brief.accentTarget))
    addIssue(context, ["accentTarget"], "the accent target must name a subject in the brief");

  if (new Set(brief.placements).size !== brief.placements.length)
    addIssue(context, ["placements"], "requested placements must be unique");

  const assertionCopy = [
    brief.source.headline,
    brief.source.body,
    brief.takeaway,
    brief.depiction.statement,
    ...labels.map((label) => label.text),
  ];
  if ((brief.depiction.productBehavior || assertionCopy.some(hasNumber)) && brief.factReferences.length === 0)
    addIssue(context, ["factReferences"], "product behavior and numbers require an approved fact reference");

  const source = `${brief.source.headline} ${brief.source.body}`.toLocaleLowerCase("en");
  const subjects = [brief.focalSubject, ...brief.supportingSubjects];
  for (const [index, subject] of subjects.entries()) {
    const subjectPath: PropertyKey[] = index === 0 ? ["focalSubject"] : ["supportingSubjects", index - 1];
    if (subject.form === "agent-cue") {
      const provider = VISUAL_AGENT_PROVIDER_FIXTURES[subject.agentProvider];
      if (!source.includes(provider.name.toLocaleLowerCase("en"))) {
        addIssue(
          context,
          [...subjectPath, "agentProvider"],
          "the source copy must explicitly name every agent provider",
        );
      }
      continue;
    }

    const fixtures = subject.fixtures;
    if (!fixtures) {
      if (subject.form === "channel-mark")
        addIssue(context, [...subjectPath, "fixtures"], "channel marks require an approved provider fixture");
      continue;
    }

    if (Object.values(fixtures).every((fixture) => fixture === undefined))
      addIssue(context, [...subjectPath, "fixtures"], "fixture bindings cannot be empty");

    if (subject.form === "channel-mark" && !fixtures.provider)
      addIssue(context, [...subjectPath, "fixtures", "provider"], "channel marks require an approved provider fixture");

    if (fixtures.provider) {
      if (subject.form !== "channel-mark" && subject.form !== "draft") {
        addIssue(
          context,
          [...subjectPath, "fixtures", "provider"],
          "provider fixtures belong to channel marks or drafts",
        );
      }

      const provider = VISUAL_PROVIDER_FIXTURES[fixtures.provider];
      if (!source.includes(provider.name.toLocaleLowerCase("en"))) {
        addIssue(
          context,
          [...subjectPath, "fixtures", "provider"],
          "the source copy must explicitly name every provider mark",
        );
      }
    }

    if (fixtures.person) {
      const person = VISUAL_PERSON_FIXTURES[fixtures.person];
      if (!source.includes(person.name.toLocaleLowerCase("en"))) {
        addIssue(
          context,
          [...subjectPath, "fixtures", "person"],
          "the source copy must explicitly name every person identity",
        );
      }
    }

    if (fixtures.person && fixtures.provider) {
      const permitted = VISUAL_PROVIDER_PERSON_PAIRINGS[fixtures.provider];
      if (!permitted?.includes(fixtures.person)) {
        addIssue(
          context,
          [...subjectPath, "fixtures"],
          "the provider and person must match a seeded conversation pairing",
        );
      }
    }

    if (fixtures.status && subject.form !== "record" && subject.form !== "signal" && subject.form !== "context-card") {
      addIssue(
        context,
        [...subjectPath, "fixtures", "status"],
        "status fixtures belong to records, signals, or context cards",
      );
    }

    if (fixtures.record) {
      if (subject.form !== "record" && subject.form !== "signal" && subject.form !== "context-card") {
        addIssue(
          context,
          [...subjectPath, "fixtures", "record"],
          "record fixtures belong to records, signals, or context cards",
        );
      }

      const record = VISUAL_RECORD_FIXTURES[fixtures.record];
      if (!source.includes(record.name.toLocaleLowerCase("en"))) {
        addIssue(
          context,
          [...subjectPath, "fixtures", "record"],
          "the source copy must explicitly name every record fixture",
        );
      }
      if (fixtures.status !== record.status)
        addIssue(context, [...subjectPath, "fixtures"], "record fixtures require their seeded status binding");
    }
  }

  if (brief.template === "converge") {
    const providers = brief.supportingSubjects.flatMap((subject) =>
      subject.fixtures?.provider ? [subject.fixtures.provider] : [],
    );
    const activeSources = brief.supportingSubjects.filter((subject) => subject.fixtures?.person);
    const supportsFit =
      brief.focalSubject.form === "record" &&
      brief.supportingSubjects.length >= 2 &&
      brief.supportingSubjects.every((subject) => subject.form === "channel-mark");
    if (!supportsFit) addIssue(context, ["template"], "converge needs one record and two or three channel marks");
    if (new Set(providers).size !== providers.length)
      addIssue(context, ["supportingSubjects"], "converge provider fixtures must be unique");
    if (
      activeSources.length !== 1 ||
      !brief.focalSubject.fixtures?.person ||
      activeSources[0]?.fixtures?.person !== brief.focalSubject.fixtures.person
    ) {
      addIssue(
        context,
        ["supportingSubjects"],
        "converge needs one active seeded conversation matching the focal person",
      );
    }
  }

  if (brief.template === "handoff") {
    const forms = new Set(brief.supportingSubjects.map((subject) => subject.form));
    const human = brief.supportingSubjects.find((subject) => subject.form === "human-action");
    const supportsFit =
      brief.focalSubject.form === "draft" &&
      brief.supportingSubjects.length === 2 &&
      forms.has("agent-cue") &&
      Boolean(human);
    if (!supportsFit) addIssue(context, ["template"], "handoff needs one draft, one agent cue, and one human action");
    if (human && brief.accentTarget !== human.id)
      addIssue(context, ["accentTarget"], "handoff reserves the accent for the human action");
    if (
      !brief.focalSubject.fixtures?.person ||
      !brief.focalSubject.fixtures.provider ||
      !human?.fixtures?.person ||
      brief.focalSubject.fixtures.person === human.fixtures.person
    ) {
      addIssue(
        context,
        ["focalSubject", "fixtures"],
        "handoff needs a seeded recipient/provider and a different seeded human actor",
      );
    }

    const expectedLabels = HANDOFF_LABELS[brief.locale];
    const labelsFit =
      brief.focalLabel?.text === expectedLabels.focal &&
      brief.semanticLabels.length === 1 &&
      brief.semanticLabels[0]?.text === expectedLabels.semantic;
    if (!labelsFit) addIssue(context, ["semanticLabels"], "handoff requires only the localized Draft and Send labels");
  }

  if (brief.template === "focus") {
    const supportsFit =
      brief.focalSubject.form === "signal" &&
      brief.supportingSubjects.length >= 1 &&
      brief.supportingSubjects.every((subject) => subject.form === "context-card" || subject.form === "trace");
    if (!supportsFit) addIssue(context, ["template"], "focus needs one signal over quiet context or a trace");
  }
});

export type VisualBrief = z.infer<typeof VisualBriefSchema>;
export type BrandIllustrationBrief = Extract<VisualBrief, { kind: "brand-illustration" }>;
export type ProductProofBrief = Extract<VisualBrief, { kind: "product-proof" }>;
export type NoVisualBrief = Extract<VisualBrief, { kind: "none" }>;

export function visualSourceChecksum(headline: string, body: string) {
  const source = `${headline}\u001f${body}`;
  let hash = 0x811c9dc5;
  for (let index = 0; index < source.length; index += 1) {
    hash ^= source.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return `fnv1a-${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

export function validateVisualBrief(value: unknown): VisualBrief {
  return VisualBriefSchema.parse(value);
}

export function inferVisualKind(visualEarned: boolean): Exclude<VisualKind, "product-proof"> {
  return visualEarned ? "brand-illustration" : "none";
}
