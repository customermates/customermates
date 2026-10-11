import type { RecordRepo } from "@/features/records/record.repo";
import type { PreviewRecordConfigurationInteractor } from "@/features/records/preview-record-configuration.interactor";
import type { SetupPlan } from "@/features/workspace-setup/setup-plan.schema";
import type { WorkspaceSetupRepo } from "./workspace-setup.repo";
import type { StoredSetupInterview, WorkspaceSetupFailure, WorkspaceSetupRecord } from "./workspace-setup.schema";
import type { WorkspaceSetupModelService } from "./workspace-setup-model.service";

import { UserAccessor } from "@/core/base/user-accessor";
import { compileSetupRecordModel } from "@/features/workspace-setup/setup-model-compiler";
import { mergeWebsitePrefill } from "@/features/workspace-setup/setup-prefill";
import { APP_LOCALES } from "@/i18n/locale-registry";

import {
  FollowUpWireSchema,
  PlanWireSchema,
  PrefillWireSchema,
  followUpQuestions,
  planFromWire,
  prefillAnswers,
} from "./workspace-setup-wire";
import {
  SETUP_FOLLOW_UP_INSTRUCTION,
  SETUP_PLAN_INSTRUCTION,
  SETUP_PREFILL_INSTRUCTION,
  encodePromptJson,
  setupInterviewCatalog,
  setupPresetCatalog,
  untrustedText,
} from "./workspace-setup-prompts";
import { answersForPrompt, loadSetupSpreadsheet, setupCurrency, setupLanguage } from "./workspace-setup-inputs";

export const SETUP_GENERATION_STALE_MS = 15 * 60 * 1_000;
const PREFILL_SOURCE_CHARACTERS = 60_000;
const PLAN_SOURCE_CHARACTERS = 12_000;
const PLAN_SOURCES = 8;
const PLAN_ATTEMPTS = 2;
const CRAWL_READING = new Set(["queued", "discovering", "fetching"]);

type Claimable = "prefill" | "plan";

function stale(claimedAt: string | null, now: Date) {
  return !claimedAt || new Date(claimedAt).getTime() < now.getTime() - SETUP_GENERATION_STALE_MS;
}

export class WorkspaceSetupInterviewService extends UserAccessor {
  constructor(
    private repo: WorkspaceSetupRepo,
    private models: Pick<WorkspaceSetupModelService, "generate" | "drainWarnings">,
    private records: Pick<RecordRepo, "getModel">,
    private preview: Pick<PreviewRecordConfigurationInteractor, "invoke">,
  ) {
    super();
  }

  drainWarnings(): string[] {
    return this.models.drainWarnings();
  }

  private async claim(setupId: string, kind: Claimable, from: StoredSetupInterview["prefill"][]) {
    const now = new Date();
    const claimed = await this.repo.mutate(setupId, (setup) => {
      const state = setup.interview[kind];
      const claimedAt = kind === "prefill" ? setup.interview.prefillClaimedAt : setup.interview.planClaimedAt;
      if (kind === "plan" && setup.status !== "planning") return null;
      if (!from.includes(state) && !(state === "running" && stale(claimedAt, now))) return null;
      return {
        interview: {
          ...setup.interview,
          [kind]: "running",
          ...(kind === "prefill" ? { prefillClaimedAt: now.toISOString() } : { planClaimedAt: now.toISOString() }),
        },
      };
    });
    return claimed?.changed ? claimed.setup : null;
  }

  async prefill(setupId: string, force: boolean): Promise<"done" | "wait"> {
    const setup = await this.repo.get(setupId);
    if (!setup || setup.interview.prefill !== "idle") return "done";
    if (!setup.crawlId) {
      await this.finishPrefill(setupId, "skipped", null, null);
      return "done";
    }
    const crawl = await this.repo.crawlState(setup.crawlId);
    if (crawl && CRAWL_READING.has(crawl.status) && !force) return "wait";
    const sources = await this.repo.crawlSources(setup.crawlId);
    if (sources.length === 0) {
      await this.finishPrefill(setupId, "skipped", null, null);
      return "done";
    }
    const claimed = await this.claim(setupId, "prefill", ["idle"]);
    if (!claimed) return "done";
    let budget = PREFILL_SOURCE_CHARACTERS;
    const text = sources
      .flatMap((source) => {
        if (budget <= 0) return [];
        const entry = `# ${source.title}\n${source.url}\n\n${source.text}`.slice(0, budget);
        budget -= entry.length;
        return [entry];
      })
      .join("\n\n");
    const catalog = await setupInterviewCatalog((part) => part.prefill !== "no");
    const result = await this.models.generate({
      label: "Workspace setup pre-fill",
      purpose: "setupDrafting",
      schema: PrefillWireSchema,
      system: SETUP_PREFILL_INSTRUCTION,
      prompt: [
        `Locale codes for language: ${APP_LOCALES.join(", ")}.`,
        `Interview parts: ${encodePromptJson(catalog)}`,
        "Website:",
        untrustedText(text),
      ].join("\n"),
    });
    if (!result.ok) {
      await this.finishPrefill(setupId, "failed", result.failure, null);
      return "done";
    }
    await this.finishPrefill(setupId, "completed", null, prefillAnswers(result.value));
    return "done";
  }

  private async finishPrefill(
    setupId: string,
    state: "completed" | "failed" | "skipped",
    error: StoredSetupInterview["prefillError"],
    draft: StoredSetupInterview["prefillDraft"],
  ) {
    await this.repo.mutate(setupId, (setup) => ({
      interview: { ...setup.interview, prefill: state, prefillError: error, prefillDraft: draft },
      ...(draft && setup.status === "interview" ? { answers: mergeWebsitePrefill(setup.answers, draft) } : {}),
    }));
  }

  async followUps(setupId: string): Promise<"asked" | "none" | "skip"> {
    const setup = await this.repo.get(setupId);
    if (!setup || setup.status !== "planning") return "skip";
    if (setup.interview.followUps !== "idle") return "none";
    const catalog = await setupInterviewCatalog();
    const result = await this.models.generate({
      label: "Workspace setup follow-ups",
      purpose: "setupPlanning",
      schema: FollowUpWireSchema,
      system: SETUP_FOLLOW_UP_INSTRUCTION,
      prompt: [
        `Interview language: ${setupLanguage(setup.answers)}.`,
        `Interview parts: ${encodePromptJson(catalog)}`,
        "Answers:",
        untrustedText(encodePromptJson(answersForPrompt(setup.answers))),
      ].join("\n"),
    });
    const questions = result.ok ? followUpQuestions(result.value) : [];
    const updated = await this.repo.mutate(setupId, (current) => {
      if (current.status !== "planning" || current.interview.followUps !== "idle") return null;
      const interview = { ...current.interview, followUps: "completed" as const, followUpQuestions: questions };
      return questions.length
        ? { status: "interview" as const, interview: { ...interview, plan: "idle" as const, planClaimedAt: null } }
        : { interview };
    });
    return updated?.changed && questions.length ? "asked" : "none";
  }

  async plan(setupId: string): Promise<void> {
    const setup = await this.claim(setupId, "plan", ["queued"]);
    if (!setup) return;
    const revision = setup.planRevision;
    const outcome = await this.generatePlan(setup);
    await this.repo.mutate(setupId, (current) => {
      if (current.status !== "planning" || current.planRevision !== revision) return null;
      return outcome.ok
        ? {
            status: "planned",
            plan: outcome.plan,
            interview: { ...current.interview, plan: "completed", planError: null, planClaimedAt: null },
          }
        : {
            status: "interview",
            interview: { ...current.interview, plan: "failed", planError: outcome.failure, planClaimedAt: null },
          };
    });
  }

  private async generatePlan(
    setup: WorkspaceSetupRecord,
  ): Promise<{ ok: true; plan: SetupPlan } | { ok: false; failure: WorkspaceSetupFailure }> {
    const language = setupLanguage(setup.answers);
    const model = await this.records.getModel();
    const catalog = await setupInterviewCatalog();
    const sources = setup.crawlId ? (await this.repo.crawlSources(setup.crawlId)).slice(0, PLAN_SOURCES) : [];
    const sheet = await loadSetupSpreadsheet(
      setup.hasSpreadsheet ? await this.repo.readSpreadsheet(setup.id) : null,
      language,
    );
    const followUps = setup.interview.followUpQuestions.map((question) => ({
      question: question.label,
      format: question.format,
      ...("options" in question ? { options: question.options } : {}),
      answer: setup.interview.followUpAnswers.find((answer) => answer.id === question.id)?.value ?? null,
    }));
    const website = sources
      .map((source) =>
        `# ${source.title}\n${source.url}\n\n${source.text}`.slice(0, PLAN_SOURCE_CHARACTERS / PLAN_SOURCES),
      )
      .join("\n\n");
    const base = [
      `Interview language: ${language}. Workspace currency: ${setupCurrency(setup.answers) ?? "EUR"}.`,
      `Standard lists, fields and relationships: ${encodePromptJson(setupPresetCatalog(this.companyId, model))}`,
      `Interview parts: ${encodePromptJson(catalog)}`,
      "Answers and follow-ups:",
      untrustedText(encodePromptJson({ answers: answersForPrompt(setup.answers), followUps })),
      ...(website ? ["Website summary:", untrustedText(website)] : []),
      ...(sheet
        ? [
            "Uploaded spreadsheet to import (map its columns in importMapping, add fields it needs):",
            untrustedText(encodePromptJson({ profile: sheet.profile, preview: sheet.preview })),
          ]
        : ["No spreadsheet was uploaded: importMapping is null."]),
    ];
    let repair: string[] = [];
    for (let attempt = 0; attempt < PLAN_ATTEMPTS; attempt += 1) {
      const result = await this.models.generate({
        label: "Workspace setup plan",
        purpose: "setupPlanning",
        schema: PlanWireSchema,
        system: SETUP_PLAN_INSTRUCTION,
        prompt: [...base, ...repair].join("\n"),
      });
      if (!result.ok) {
        if (result.failure !== "generation") return { ok: false, failure: result.failure };
        continue;
      }
      const converted = planFromWire(result.value);
      const issues = converted.ok ? await this.planIssues(setup.id, converted.plan) : converted.issues;
      if (converted.ok && issues.length === 0) return { ok: true, plan: converted.plan };
      repair = [
        "Your previous plan was rejected. Return a corrected complete plan that fixes these problems:",
        encodePromptJson(issues.slice(0, 30)),
      ];
    }
    return { ok: false, failure: "invalidPlan" };
  }

  async planIssues(setupId: string, plan: SetupPlan): Promise<Array<{ path: string; message: string }>> {
    const model = await this.records.getModel();
    const compiled = compileSetupRecordModel(plan, { companyId: this.companyId, setupId, model });
    if (!compiled.ok) return compiled.issues.map((issue) => ({ path: issue.path, message: issue.code }));
    const previewed = await this.preview.invoke(compiled.data);
    if (!previewed.ok) return [{ path: "recordModel", message: "The record model change is not valid." }];
    return previewed.data.issues.map((issue) => ({
      path: "recordModel",
      message: [issue.code, issue.typeId, issue.fieldId, issue.relationId].filter(Boolean).join(" "),
    }));
  }
}
