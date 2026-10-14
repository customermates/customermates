import type { z } from "zod";
import type { RecordAccessPolicy } from "@/features/records/record-access";
import type { RecordConfigurationService } from "@/features/records/configuration.service";
import type { RecordRepo } from "@/features/records/record.repo";
import type { PreviewRecordConfigurationInteractor } from "@/features/records/preview-record-configuration.interactor";
import type { SetupAnswers } from "@/features/workspace-setup/setup-answers.schema";
import type { SetupPlan } from "@/features/workspace-setup/setup-plan.schema";
import type { WorkspaceSetupFailure } from "./workspace-setup.schema";
import type { SetupCrawlSource } from "./workspace-setup.repo";
import type { WorkspaceSetupModelService } from "./workspace-setup-model.service";
import type { LoadedSpreadsheet } from "./workspace-setup-inputs";
import type { PlanKnowledgeWire, PlanModelWire, PlanViewsWire, PlanWire } from "./workspace-setup-wire";

import { UserAccessor } from "@/core/base/user-accessor";
import { createSetupResolver } from "@/features/workspace-setup/setup-references";
import { compileSetupDashboard } from "@/features/workspace-setup/setup-dashboard-compiler";
import { compileSetupImportMapping } from "@/features/workspace-setup/setup-import-compiler";
import { compileSetupRecordModel } from "@/features/workspace-setup/setup-model-compiler";
import { compileSetupListDefaults } from "@/features/workspace-setup/setup-view-compiler";
import { untrustedText } from "@/features/mcp-tools/untrusted-record-content";

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
  setupPresetCatalog,
} from "./workspace-setup-prompts";
import { setupWebsiteText } from "./workspace-setup-website";

const PLAN_PART_ATTEMPTS = 2;
const REPAIR_ISSUES = 30;
const ISSUE_VALUE_CHARACTERS = 400;
const MODEL_WEBSITE = { characters: 6_000, perSource: 1_500 };
const KNOWLEDGE_WEBSITE = { characters: 8_000, perSource: 2_000 };

export type SetupPlanIssue = { path: string; message: string; value?: string | number | boolean | null };
export type SetupPlanOutcome = { ok: true; plan: SetupPlan } | { ok: false; failure: WorkspaceSetupFailure };
type PartOutcome<T> = { ok: true; value: T } | { ok: false; failure: WorkspaceSetupFailure };

export type SetupPlanInput = {
  setupId: string;
  language: string;
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

  async plan(input: SetupPlanInput): Promise<SetupPlanOutcome> {
    const model = await this.records.getModel();
    const catalog = await setupInterviewCatalog();
    const context = [
      `Interview language: ${setupLanguageName(input.language)}. Workspace currency: ${input.currency}.`,
      "Answers and follow-ups:",
      untrustedText(
        encodePromptJson({ answers: setupAnswerDigest(input.answers, catalog), followUps: input.followUps }),
      ),
    ];
    const standard = `Standard lists, fields and relationships: ${encodePromptJson(setupPresetCatalog(this.companyId, model))}`;
    const sheet = input.sheet
      ? [
          "Uploaded spreadsheet to import (add the fields it needs):",
          untrustedText(encodePromptJson({ profile: input.sheet.profile, preview: input.sheet.preview })),
        ]
      : [];
    const website = (budget: { characters: number; perSource: number }) => {
      const text = setupWebsiteText(input.sources, budget);
      return text ? ["Website:", untrustedText(text)] : [];
    };
    const [modelPart, knowledgePart] = await Promise.all([
      this.part<PlanModelWire>({
        label: "Workspace setup plan: record model",
        purpose: "setupPlanning",
        schema: PlanModelWireSchema,
        system: SETUP_PLAN_MODEL_INSTRUCTION,
        prompt: [...context, standard, ...website(MODEL_WEBSITE), ...sheet],
        check: async (value) => {
          const owned = ["workspace", "recordModel"];
          const wire = (model: PlanModelWire) =>
            planWireFromParts(model, EMPTY_PLAN_VIEWS_WIRE, EMPTY_PLAN_KNOWLEDGE_WIRE);
          const issues = await this.wireIssues(input.setupId, wire(value), owned);
          const pruned = withoutInvalidCalculations(value, issues);
          if (pruned === value) return { value, issues };
          return { value: pruned, issues: await this.wireIssues(input.setupId, wire(pruned), owned) };
        },
      }),
      this.part<PlanKnowledgeWire>({
        label: "Workspace setup plan: Knowledge Base",
        purpose: "setupDrafting",
        schema: PlanKnowledgeWireSchema,
        system: SETUP_PLAN_KNOWLEDGE_INSTRUCTION,
        prompt: [...context, ...website(KNOWLEDGE_WEBSITE)],
        check: async (value) => ({
          value,
          issues: await this.wireIssues(
            input.setupId,
            planWireFromParts(EMPTY_PLAN_MODEL_WIRE, EMPTY_PLAN_VIEWS_WIRE, value),
            ["knowledgeBase"],
          ),
        }),
      }),
    ]);
    if (!modelPart.ok) return modelPart;
    if (!knowledgePart.ok) return knowledgePart;
    const viewsPart = await this.part<PlanViewsWire>({
      label: "Workspace setup plan: views and dashboard",
      purpose: "setupPlanning",
      schema: PlanViewsWireSchema,
      system: SETUP_PLAN_VIEWS_INSTRUCTION,
      prompt: [
        ...context,
        standard,
        `Planned record model: ${encodePromptJson(modelPart.value)}`,
        ...(sheet.length ? sheet : ["No spreadsheet was uploaded: importMapping is null."]),
      ],
      check: async (value) => {
        const owned = ["listDefaults", "sampleData", "dashboard", "importMapping"];
        const wire = (views: PlanViewsWire) => planWireFromParts(modelPart.value, views, knowledgePart.value);
        const issues = await this.wireIssues(input.setupId, wire(value), owned);
        const pruned = withoutUnknownColumns(value, issues);
        if (pruned === value) return { value, issues };
        return { value: pruned, issues: await this.wireIssues(input.setupId, wire(pruned), owned) };
      },
    });
    if (!viewsPart.ok) return viewsPart;
    const converted = planFromWire(planWireFromParts(modelPart.value, viewsPart.value, knowledgePart.value));
    if (!converted.ok || (await this.issues(input.setupId, converted.plan)).length)
      return { ok: false, failure: "invalidPlan" };
    return { ok: true, plan: converted.plan };
  }

  private async part<T>(part: PlanPart<T>): Promise<PartOutcome<T>> {
    let repair: string[] = [];
    for (let attempt = 0; attempt < PLAN_PART_ATTEMPTS; attempt += 1) {
      const result = await this.models.generate({
        label: part.label,
        purpose: part.purpose,
        schema: part.schema,
        system: part.system,
        prompt: [...part.prompt, ...repair].join("\n"),
      });
      if (!result.ok) {
        if (result.failure !== "generation") return { ok: false, failure: result.failure };
        repair = [SETUP_REPAIR_INSTRUCTION, encodePromptJson([result.rejection ?? "The answer could not be read."])];
        continue;
      }
      const { value, issues } = await part.check(result.value);
      if (issues.length === 0) return { ok: true, value };
      repair = [
        `Your previous answer: ${encodePromptJson(result.value)}`,
        SETUP_REPAIR_INSTRUCTION,
        encodePromptJson(issues.slice(0, REPAIR_ISSUES)),
      ];
    }
    return { ok: false, failure: "invalidPlan" };
  }

  private async wireIssues(setupId: string, wire: PlanWire, prefixes: string[]): Promise<SetupPlanIssue[]> {
    const converted = planFromWire(wire);
    const issues = converted.ok ? await this.issues(setupId, converted.plan) : converted.issues;
    return issues.filter(owns(prefixes)).map((issue) => {
      const value = valueAt(converted.ok ? converted.plan : wire, issue.path);
      const path = planPartPath(issue.path);
      return value === undefined ? { ...issue, path } : { ...issue, path, value };
    });
  }

  async issues(setupId: string, plan: SetupPlan): Promise<SetupPlanIssue[]> {
    const model = await this.records.getModel();
    const compiled = compileSetupRecordModel(plan, { companyId: this.companyId, setupId, model });
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
    const resolver = createSetupResolver(plan, {
      companyId: this.companyId,
      model: prepared.model,
      references: prepared.preview.references,
    });
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
