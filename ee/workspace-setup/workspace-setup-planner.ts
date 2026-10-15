import type { RecordAccessPolicy } from "@/features/records/record-access";
import type { RecordConfigurationService } from "@/features/records/configuration.service";
import type { RecordRepo } from "@/features/records/record.repo";
import type { PreviewRecordConfigurationInteractor } from "@/features/records/preview-record-configuration.interactor";
import type { SetupAnswers } from "@/features/workspace-setup/setup-answers.schema";
import type { SetupPlan } from "@/features/workspace-setup/setup-plan.schema";
import type { AppLocale } from "@/i18n/locale-registry";
import type { WorkspaceSetupFailure } from "./workspace-setup.schema";
import type { SetupCrawlSource } from "./workspace-setup.repo";
import type { WorkspaceSetupModelService } from "./workspace-setup-model.service";
import type { LoadedSpreadsheet } from "./workspace-setup-inputs";
import type { PlanKnowledgeWire, PlanModelWire, PlanViewsWire, PlanWire } from "./workspace-setup-wire";

import { z } from "zod";

import { UserAccessor } from "@/core/base/user-accessor";
import { setupAnchorFields } from "@/features/workspace-setup/setup-anchors";
import { createSetupResolver } from "@/features/workspace-setup/setup-references";
import { compileSetupDashboard } from "@/features/workspace-setup/setup-dashboard-compiler";
import { compileSetupImportMapping } from "@/features/workspace-setup/setup-import-compiler";
import { compileSetupRecordModel } from "@/features/workspace-setup/setup-model-compiler";
import { compileSetupListDefaults } from "@/features/workspace-setup/setup-view-compiler";
import { untrustedText } from "@/features/mcp-tools/untrusted-record-content";

import { WORKSPACE_SETUP_FAILURES } from "./workspace-setup.schema";
import {
  EMPTY_PLAN_KNOWLEDGE_WIRE,
  EMPTY_PLAN_MODEL_WIRE,
  EMPTY_PLAN_VIEWS_WIRE,
  PlanKnowledgeWireSchema,
  PlanModelWireSchema,
  PlanViewsWireSchema,
  planFromWire,
  planPartPath,
  planWireFromParts,
} from "./workspace-setup-wire";
import {
  SETUP_PLAN_KNOWLEDGE_INSTRUCTION,
  SETUP_PLAN_MODEL_INSTRUCTION,
  SETUP_REPAIR_INSTRUCTION,
  SETUP_PLAN_VIEWS_INSTRUCTION,
  encodePromptJson,
  setupAnswerDigest,
  setupInterviewCatalog,
  setupLanguageName,
} from "./workspace-setup-prompts";
import { setupModelLabels } from "./workspace-setup-labels";
import { setupWebsiteText } from "./workspace-setup-website";

export const SETUP_PLAN_PART_ATTEMPTS = 2;
export const SETUP_PLAN_PARTS = ["model", "knowledge", "views"] as const;
export type SetupPlanPart = (typeof SETUP_PLAN_PARTS)[number];

const REPAIR_ISSUES = 30;
const ISSUE_VALUE_CHARACTERS = 400;
const MODEL_WEBSITE = { characters: 6_000, perSource: 1_500 };
const KNOWLEDGE_WEBSITE = { characters: 8_000, perSource: 2_000 };

export const SetupPlanPartStateSchema = z
  .object({
    revision: z.number().int().nonnegative(),
    attempts: z.number().int().nonnegative(),
    value: z.unknown(),
    repair: z.array(z.string()),
    failure: z.enum(WORKSPACE_SETUP_FAILURES).nullable(),
  })
  .strict();
export type SetupPlanPartState = z.infer<typeof SetupPlanPartStateSchema>;

export function emptySetupPlanPart(revision: number): SetupPlanPartState {
  return { revision, attempts: 0, value: null, repair: [], failure: null };
}

export type SetupPlanIssue = { path: string; message: string; value?: string | number | boolean | null };
export type SetupPlanOutcome = { ok: true; plan: SetupPlan } | { ok: false; failure: WorkspaceSetupFailure };
export type SetupPlanDrafts = { model: PlanModelWire | null; knowledge: PlanKnowledgeWire | null };

export type SetupPlanInput = {
  setupId: string;
  language: AppLocale;
  answersLanguage: string | null;
  currency: string;
  answers: SetupAnswers;
  followUps: Array<{ question: string; format: string; options?: unknown; answer: unknown }>;
  sources: SetupCrawlSource[];
  sheet: LoadedSpreadsheet | null;
};

type PlanPart<T> = {
  label: string;
  purpose: "setupDrafting" | "setupPlanning";
  schema: z.ZodType<T>;
  system: string;
  prompt: string[];
  check: (value: T) => Promise<{ value: T; issues: SetupPlanIssue[] }>;
};

function owns(prefixes: string[]) {
  return (issue: SetupPlanIssue) =>
    prefixes.some((prefix) => issue.path === prefix || issue.path.startsWith(`${prefix}.`));
}

function valueAt(wire: unknown, path: string): SetupPlanIssue["value"] | undefined {
  let node: unknown = wire;
  for (const key of path.split(".")) {
    if (!node || typeof node !== "object") return undefined;
    node = (node as Record<string, unknown>)[key];
  }
  if (node === undefined) return undefined;
  if (node === null || typeof node === "string" || typeof node === "number" || typeof node === "boolean") return node;
  return JSON.stringify(node).slice(0, ISSUE_VALUE_CHARACTERS);
}

const UNKNOWN_COLUMN = /^listDefaults\.\d+\.columns\.\d+$/u;

function withoutUnknownColumns(views: PlanViewsWire, issues: SetupPlanIssue[]): PlanViewsWire {
  const unknown = new Set(
    issues.flatMap((issue) =>
      issue.message === "unknown_field" && UNKNOWN_COLUMN.test(issue.path) && typeof issue.value === "string"
        ? [issue.value]
        : [],
    ),
  );
  if (unknown.size === 0) return views;
  return {
    ...views,
    listDefaults: views.listDefaults.map((value) => ({
      ...value,
      columns: value.columns.filter((column) => !unknown.has(column)),
    })),
  };
}

const CALCULATION_ISSUE = /^calculations\.(\d+)(?:\.|$)/u;

function withoutInvalidCalculations(model: PlanModelWire, issues: SetupPlanIssue[]): PlanModelWire {
  const invalid = new Set(issues.flatMap((issue) => CALCULATION_ISSUE.exec(issue.path)?.[1] ?? []).map(Number));
  if (invalid.size === 0) return model;
  return { ...model, calculations: model.calculations.filter((_calculation, index) => !invalid.has(index)) };
}

export class WorkspaceSetupPlanner extends UserAccessor {
  constructor(
    private models: Pick<WorkspaceSetupModelService, "generate">,
    private records: Pick<RecordRepo, "getModel">,
    private preview: Pick<PreviewRecordConfigurationInteractor, "invoke">,
    private configurations: Pick<RecordConfigurationService, "prepare">,
    private policy: Pick<RecordAccessPolicy, "load">,
  ) {
    super();
  }

  async attempt(
    part: SetupPlanPart,
    input: SetupPlanInput,
    state: SetupPlanPartState,
    drafts: SetupPlanDrafts,
  ): Promise<SetupPlanPartState> {
    const context = await this.context(input);
    switch (part) {
      case "model":
        return this.run(this.modelPart(input, context), state);
      case "knowledge":
        return this.run(this.knowledgePart(input, context), state);
      case "views":
        return drafts.model
          ? this.run(this.viewsPart(input, context, drafts.model, drafts.knowledge), state)
          : { ...state, attempts: state.attempts + 1, failure: "invalidPlan" };
    }
  }

  async assemble(
    input: SetupPlanInput,
    parts: { model: PlanModelWire; knowledge: PlanKnowledgeWire; views: PlanViewsWire },
  ): Promise<SetupPlanOutcome> {
    const converted = planFromWire(planWireFromParts(parts.model, parts.views, parts.knowledge));
    if (!converted.ok || (await this.issues(input.setupId, converted.plan, input.language)).length)
      return { ok: false, failure: "invalidPlan" };
    return { ok: true, plan: converted.plan };
  }

  private async context(input: SetupPlanInput) {
    const catalog = await setupInterviewCatalog();
    return [
      `Workspace language: ${setupLanguageName(input.language)}. Workspace currency: ${input.currency}.`,
      ...(input.answersLanguage && input.answersLanguage !== input.language
        ? [`Answers drafted from the website are written in ${setupLanguageName(input.answersLanguage)}.`]
        : []),
      "Answers and follow-ups:",
      untrustedText(
        encodePromptJson({ answers: setupAnswerDigest(input.answers, catalog), followUps: input.followUps }),
      ),
    ];
  }

  private sheet(input: SetupPlanInput) {
    return input.sheet
      ? [
          "Uploaded spreadsheet to import (add the fields it needs):",
          untrustedText(encodePromptJson({ profile: input.sheet.profile, preview: input.sheet.preview })),
        ]
      : [];
  }

  private website(input: SetupPlanInput, budget: { characters: number; perSource: number }) {
    const text = setupWebsiteText(input.sources, budget);
    return text ? ["Website:", untrustedText(text)] : [];
  }

  private modelPart(input: SetupPlanInput, context: string[]): PlanPart<PlanModelWire> {
    return {
      label: "Workspace setup plan: record model",
      purpose: "setupPlanning",
      schema: PlanModelWireSchema,
      system: SETUP_PLAN_MODEL_INSTRUCTION,
      prompt: [...context, ...this.website(input, MODEL_WEBSITE), ...this.sheet(input)],
      check: async (value) => {
        const owned = ["workspace", "recordModel"];
        const wire = (model: PlanModelWire) =>
          planWireFromParts(model, EMPTY_PLAN_VIEWS_WIRE, EMPTY_PLAN_KNOWLEDGE_WIRE);
        const issues = await this.wireIssues(input, wire(value), owned);
        const pruned = withoutInvalidCalculations(value, issues);
        if (pruned === value) return { value, issues };
        return { value: pruned, issues: await this.wireIssues(input, wire(pruned), owned) };
      },
    };
  }

  private knowledgePart(input: SetupPlanInput, context: string[]): PlanPart<PlanKnowledgeWire> {
    return {
      label: "Workspace setup plan: Knowledge Base",
      purpose: "setupDrafting",
      schema: PlanKnowledgeWireSchema,
      system: SETUP_PLAN_KNOWLEDGE_INSTRUCTION,
      prompt: [...context, ...this.website(input, KNOWLEDGE_WEBSITE)],
      check: async (value) => ({
        value,
        issues: await this.wireIssues(input, planWireFromParts(EMPTY_PLAN_MODEL_WIRE, EMPTY_PLAN_VIEWS_WIRE, value), [
          "knowledgeBase",
        ]),
      }),
    };
  }

  private viewsPart(
    input: SetupPlanInput,
    context: string[],
    model: PlanModelWire,
    knowledge: PlanKnowledgeWire | null,
  ): PlanPart<PlanViewsWire> {
    const sheet = this.sheet(input);
    return {
      label: "Workspace setup plan: views and dashboard",
      purpose: "setupPlanning",
      schema: PlanViewsWireSchema,
      system: SETUP_PLAN_VIEWS_INSTRUCTION,
      prompt: [
        ...context,
        `Planned record model: ${encodePromptJson(model)}`,
        `Automatic fields: ${encodePromptJson(setupAnchorFields(model.lists))}`,
        ...(sheet.length ? sheet : ["No spreadsheet was uploaded: importMapping is null."]),
      ],
      check: async (value) => {
        const owned = ["listDefaults", "sampleData", "dashboard", "importMapping"];
        const wire = (views: PlanViewsWire) => planWireFromParts(model, views, knowledge ?? EMPTY_PLAN_KNOWLEDGE_WIRE);
        const issues = await this.wireIssues(input, wire(value), owned);
        const pruned = withoutUnknownColumns(value, issues);
        if (pruned === value) return { value, issues };
        return { value: pruned, issues: await this.wireIssues(input, wire(pruned), owned) };
      },
    };
  }

  private async run<T>(part: PlanPart<T>, state: SetupPlanPartState): Promise<SetupPlanPartState> {
    const attempts = state.attempts + 1;
    const final = attempts >= SETUP_PLAN_PART_ATTEMPTS;
    const result = await this.models.generate({
      label: part.label,
      purpose: part.purpose,
      schema: part.schema,
      system: part.system,
      prompt: [...part.prompt, ...state.repair].join("\n"),
    });
    if (!result.ok) {
      if (result.failure !== "generation") return { ...state, attempts, repair: [], failure: result.failure };
      return {
        ...state,
        attempts,
        repair: [SETUP_REPAIR_INSTRUCTION, encodePromptJson([result.rejection ?? "The answer could not be read."])],
        failure: final ? "generation" : null,
      };
    }
    const { value, issues } = await part.check(result.value);
    if (issues.length === 0) return { ...state, attempts, value, repair: [], failure: null };
    return {
      ...state,
      attempts,
      repair: [
        `Your previous answer: ${encodePromptJson(result.value)}`,
        SETUP_REPAIR_INSTRUCTION,
        encodePromptJson(issues.slice(0, REPAIR_ISSUES)),
      ],
      failure: final ? "invalidPlan" : null,
    };
  }

  private async wireIssues(input: SetupPlanInput, wire: PlanWire, prefixes: string[]): Promise<SetupPlanIssue[]> {
    const converted = planFromWire(wire);
    const issues = converted.ok ? await this.issues(input.setupId, converted.plan, input.language) : converted.issues;
    return issues.filter(owns(prefixes)).map((issue) => {
      const value = valueAt(converted.ok ? converted.plan : wire, issue.path);
      const path = planPartPath(issue.path);
      return value === undefined ? { ...issue, path } : { ...issue, path, value };
    });
  }

  async issues(setupId: string, plan: SetupPlan, language: AppLocale): Promise<SetupPlanIssue[]> {
    const model = await this.records.getModel();
    const compiled = compileSetupRecordModel(plan, { setupId, model, labels: await setupModelLabels(language) });
    if (!compiled.ok) return compiled.issues.map((issue) => ({ path: issue.path, message: issue.code }));

    const previewed = await this.preview.invoke(compiled.data);
    if (!previewed.ok) return [{ path: "recordModel", message: "The record model change is not valid." }];

    if (previewed.data.issues.length) {
      return previewed.data.issues.map((issue) => ({
        path: "recordModel",
        message: [issue.code, issue.typeId, issue.fieldId, issue.relationId].filter(Boolean).join(" "),
      }));
    }
    let prepared;
    try {
      prepared = await this.configurations.prepare(compiled.data, model, await this.policy.load());
    } catch {
      return [{ path: "recordModel", message: "The record model change is not valid." }];
    }
    const resolver = createSetupResolver(plan, { model: prepared.model, references: prepared.preview.references });
    const results = [
      compileSetupListDefaults(plan, resolver, prepared.model),
      compileSetupDashboard(plan, resolver, prepared.model, { setupId, expectedRevision: prepared.model.revision }),
      compileSetupImportMapping(plan, resolver, prepared.model),
    ];
    return results.flatMap((result) =>
      result.ok ? [] : result.issues.map((issue) => ({ path: issue.path, message: issue.code })),
    );
  }
}
