import { z } from "zod";

import { CHIP_COLORS } from "@/constants/chip-colors";
import { ChartColor } from "@/features/widget/widget-display.schema";
import { RecordRefSchema } from "@/features/records/record-model.schema";
import { SETUP_MAX_FOLLOW_UP_QUESTIONS } from "@/features/workspace-setup/setup-interview";
import { SetupAnswerValueSchema, SetupAnswersSchema } from "@/features/workspace-setup/setup-answers.schema";
import type { SetupPlanSchema } from "@/features/workspace-setup/setup-plan.schema";
import { WIDGET_STARTER_DISPLAY_TYPES } from "@/features/widget/widget-display-rules";

export const WORKSPACE_SETUP_STATUSES = [
  "interview",
  "planning",
  "planned",
  "building",
  "completed",
  "failed",
  "rolledBack",
] as const;
export type WorkspaceSetupStatus = (typeof WORKSPACE_SETUP_STATUSES)[number];

export const WORKSPACE_SETUP_PHASES = ["knowledgeBase", "dataModel", "views", "records", "dashboard"] as const;
export type WorkspaceSetupPhase = (typeof WORKSPACE_SETUP_PHASES)[number];
export const WORKSPACE_SETUP_PHASE_DEPENDENCIES: Record<WorkspaceSetupPhase, WorkspaceSetupPhase[]> = {
  knowledgeBase: [],
  dataModel: [],
  views: ["dataModel"],
  records: ["dataModel"],
  dashboard: ["dataModel"],
};

export const WORKSPACE_SETUP_PHASE_STATUSES = [
  "pending",
  "running",
  "completed",
  "failed",
  "skipped",
  "stopped",
] as const;
export type WorkspaceSetupPhaseStatus = (typeof WORKSPACE_SETUP_PHASE_STATUSES)[number];

export const WORKSPACE_SETUP_FAILURES = [
  "spendCap",
  "aiUnavailable",
  "generation",
  "invalidPlan",
  "schemaChanged",
  "permission",
  "crawlFailed",
  "spreadsheet",
  "dependency",
  "error",
] as const;
export type WorkspaceSetupFailure = (typeof WORKSPACE_SETUP_FAILURES)[number];

const IsoDateSchema = z.iso.datetime();

export const StoredSetupPhaseSchema = z
  .object({
    status: z.enum(WORKSPACE_SETUP_PHASE_STATUSES),
    error: z.enum(WORKSPACE_SETUP_FAILURES).nullable(),
    attempts: z.number().int().nonnegative(),
    retryFrom: z.number().int().nonnegative().default(0),
    claimedAt: IsoDateSchema.nullable(),
    startedAt: IsoDateSchema.nullable(),
    finishedAt: IsoDateSchema.nullable(),
  })
  .strict();
export type StoredSetupPhase = z.infer<typeof StoredSetupPhaseSchema>;

export const StoredSetupPhasesSchema = z.partialRecord(z.enum(WORKSPACE_SETUP_PHASES), StoredSetupPhaseSchema);
export type StoredSetupPhases = z.infer<typeof StoredSetupPhasesSchema>;

const FollowUpLabelSchema = z.string().trim().min(1).max(200);
const FollowUpOptionSchema = z
  .object({ id: z.string().regex(/^[A-Za-z][A-Za-z0-9_-]{0,39}$/), label: z.string().trim().min(1).max(80) })
  .strict();
const FollowUpOptionsSchema = z
  .array(FollowUpOptionSchema)
  .min(2)
  .max(12)
  .refine((options) => new Set(options.map((option) => option.id)).size === options.length, "Option ids repeat");

export const SETUP_FOLLOW_UP_IDS = ["followUp1", "followUp2", "followUp3"] as const;

export const SetupFollowUpQuestionSchema = z.discriminatedUnion("format", [
  z
    .object({
      id: z.enum(SETUP_FOLLOW_UP_IDS),
      label: FollowUpLabelSchema,
      format: z.literal("singleChoice"),
      options: FollowUpOptionsSchema,
    })
    .strict(),
  z
    .object({
      id: z.enum(SETUP_FOLLOW_UP_IDS),
      label: FollowUpLabelSchema,
      format: z.literal("multipleChoice"),
      options: FollowUpOptionsSchema,
      allowCustom: z.boolean(),
    })
    .strict(),
  z
    .object({
      id: z.enum(SETUP_FOLLOW_UP_IDS),
      label: FollowUpLabelSchema,
      format: z.literal("orderedList"),
      winChance: z.boolean(),
      maxItems: z.number().int().min(1).max(20),
      suggestions: z.array(z.string().trim().min(1).max(80)).max(20),
    })
    .strict(),
  z
    .object({
      id: z.enum(SETUP_FOLLOW_UP_IDS),
      label: FollowUpLabelSchema,
      format: z.literal("rankedPick"),
      options: FollowUpOptionsSchema,
      maxPicks: z.number().int().min(1).max(3),
    })
    .strict(),
  z
    .object({
      id: z.enum(SETUP_FOLLOW_UP_IDS),
      label: FollowUpLabelSchema,
      format: z.literal("range"),
      unit: z.enum(["currency", "days"]),
      single: z.boolean(),
      min: z.number().finite().nonnegative(),
      max: z.number().finite().positive(),
    })
    .strict()
    .refine((question) => question.max > question.min, "The range is reversed."),
  z
    .object({
      id: z.enum(SETUP_FOLLOW_UP_IDS),
      label: FollowUpLabelSchema,
      format: z.literal("shortText"),
      maxLength: z.number().int().min(1).max(1_000),
    })
    .strict(),
]);
export type SetupFollowUpQuestion = z.infer<typeof SetupFollowUpQuestionSchema>;

export const SetupFollowUpAnswerSchema = z
  .object({ id: z.enum(SETUP_FOLLOW_UP_IDS), value: SetupAnswerValueSchema })
  .strict();
export type SetupFollowUpAnswer = z.infer<typeof SetupFollowUpAnswerSchema>;

const GenerationStateSchema = z.enum(["idle", "queued", "running", "completed", "failed", "skipped"]);
export type SetupGenerationState = z.infer<typeof GenerationStateSchema>;

export const StoredSetupInterviewSchema = z
  .object({
    prefill: GenerationStateSchema.default("idle"),
    prefillClaimedAt: IsoDateSchema.nullable().default(null),
    prefillError: z.enum(WORKSPACE_SETUP_FAILURES).nullable().default(null),
    prefillDraft: SetupAnswersSchema.nullable().default(null),
    followUps: GenerationStateSchema.default("idle"),
    followUpQuestions: z.array(SetupFollowUpQuestionSchema).max(SETUP_MAX_FOLLOW_UP_QUESTIONS).default([]),
    followUpAnswers: z.array(SetupFollowUpAnswerSchema).max(SETUP_MAX_FOLLOW_UP_QUESTIONS).default([]),
    plan: GenerationStateSchema.default("idle"),
    planError: z.enum(WORKSPACE_SETUP_FAILURES).nullable().default(null),
    planClaimedAt: IsoDateSchema.nullable().default(null),
  })
  .strict();
export type StoredSetupInterview = z.infer<typeof StoredSetupInterviewSchema>;

export const BrandMappingSchema = z
  .object({
    hex: z.string().regex(/^#[0-9a-f]{6}$/),
    chip: z.enum(CHIP_COLORS),
    chart: z.enum(ChartColor),
  })
  .strict();
export type BrandMapping = z.infer<typeof BrandMappingSchema>;

export const StoredSetupCreatedSchema = z
  .object({
    references: z.array(z.object({ reference: z.string(), id: z.uuid() }).strict()).default([]),
    lists: z.array(z.uuid()).default([]),
    fields: z.array(z.uuid()).default([]),
    relationships: z.array(z.uuid()).default([]),
    views: z.array(z.uuid()).default([]),
    widgets: z.array(z.uuid()).default([]),
    pages: z.array(z.uuid()).default([]),
    sampleRecords: z.array(RecordRefSchema).default([]),
    importedRecords: z.array(RecordRefSchema).default([]),
  })
  .strict();
export type StoredSetupCreated = z.infer<typeof StoredSetupCreatedSchema>;

export const SetupResultListSchema = z
  .object({
    id: z.uuid(),
    key: z.string(),
    name: z.string(),
    pluralName: z.string(),
    icon: z.string().nullable(),
    color: z.string().nullable(),
    created: z.boolean(),
    stages: z.array(z.string()),
  })
  .strict();

export const StoredSetupResultsSchema = z.object({
  colors: BrandMappingSchema.nullable().default(null),
  lists: z.array(SetupResultListSchema).default([]),
  views: z
    .array(z.object({ id: z.uuid(), listId: z.uuid(), name: z.string(), layout: z.enum(["table", "board"]) }).strict())
    .default([]),
  records: z
    .array(
      z
        .object({
          listId: z.uuid(),
          kind: z.enum(["sample", "imported"]),
          count: z.number().int().nonnegative(),
          titles: z.array(z.string()).max(10),
          skippedRows: z.number().int().nonnegative(),
        })
        .strict(),
    )
    .default([]),
  widgets: z
    .array(z.object({ id: z.uuid(), title: z.string(), display: z.enum(WIDGET_STARTER_DISPLAY_TYPES) }).strict())
    .default([]),
  pages: z.array(z.object({ id: z.uuid(), title: z.string() }).strict()).default([]),
});
export type StoredSetupResults = z.infer<typeof StoredSetupResultsSchema>;

export type WorkspaceSetupRecord = {
  id: string;
  userId: string;
  status: WorkspaceSetupStatus;
  websiteUrl: string | null;
  crawlId: string | null;
  answers: z.infer<typeof SetupAnswersSchema>;
  interview: StoredSetupInterview;
  plan: z.infer<typeof SetupPlanSchema> | null;
  planRevision: number;
  phases: StoredSetupPhases;
  artifacts: Record<string, unknown>;
  created: StoredSetupCreated;
  results: StoredSetupResults;
  spreadsheetName: string | null;
  hasSpreadsheet: boolean;
  startedAt: Date;
  confirmedAt: Date | null;
  finishedAt: Date | null;
};

export type WorkspaceSetupPatch = Partial<
  Pick<
    WorkspaceSetupRecord,
    | "status"
    | "answers"
    | "interview"
    | "plan"
    | "planRevision"
    | "phases"
    | "artifacts"
    | "created"
    | "results"
    | "confirmedAt"
    | "finishedAt"
    | "crawlId"
    | "websiteUrl"
  >
>;
