import type { SetupPlan } from "@/features/workspace-setup/setup-plan.schema";
import type { WorkspaceSetupRepo } from "./workspace-setup.repo";
import type { StoredSetupInterview, WorkspaceSetupFailure, WorkspaceSetupRecord } from "./workspace-setup.schema";
import type { WorkspaceSetupModelService } from "./workspace-setup-model.service";
import type { WorkspaceSetupPlanner } from "./workspace-setup-planner";

import { UserAccessor } from "@/core/base/user-accessor";
import { mergeWebsitePrefill } from "@/features/workspace-setup/setup-prefill";
import { APP_LOCALES } from "@/i18n/locale-registry";

import { FollowUpWireSchema, PrefillWireSchema, followUpQuestions, prefillAnswers } from "./workspace-setup-wire";
import {
  SETUP_FOLLOW_UP_INSTRUCTION,
  SETUP_REPAIR_INSTRUCTION,
  SETUP_PREFILL_INSTRUCTION,
  encodePromptJson,
  setupInterviewCatalog,
  setupLanguageName,
  untrustedText,
} from "./workspace-setup-prompts";
import { answersForPrompt, loadSetupSpreadsheet, setupCurrency, setupLanguage } from "./workspace-setup-inputs";
import { setupWebsiteText } from "./workspace-setup-website";

export const SETUP_GENERATION_STALE_MS = 15 * 60 * 1_000;
const PREFILL_WEBSITE = { characters: 36_000, perSource: 3_000 };
const CRAWL_READING = new Set(["queued", "discovering", "fetching"]);

type Claimable = "prefill" | "plan";

function stale(claimedAt: string | null, now: Date) {
  return !claimedAt || new Date(claimedAt).getTime() < now.getTime() - SETUP_GENERATION_STALE_MS;
}

export class WorkspaceSetupInterviewService extends UserAccessor {
  constructor(
    private repo: WorkspaceSetupRepo,
    private models: Pick<WorkspaceSetupModelService, "generate" | "drainWarnings">,
    private planner: Pick<WorkspaceSetupPlanner, "plan">,
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
    const text = setupWebsiteText(sources, PREFILL_WEBSITE);
    const catalog = await setupInterviewCatalog((part) => part.prefill !== "no", true);
    const prompt = [
      `Locale codes for language: ${APP_LOCALES.join(", ")}.`,
      `Interview parts: ${encodePromptJson(catalog)}`,
      "Website:",
      untrustedText(text),
    ].join("\n");
    let result = await this.models.generate({
      label: "Workspace setup pre-fill",
      purpose: "setupDrafting",
      schema: PrefillWireSchema,
      system: SETUP_PREFILL_INSTRUCTION,
      prompt,
    });
    if (!result.ok && result.failure === "generation") {
      result = await this.models.generate({
        label: "Workspace setup pre-fill",
        purpose: "setupDrafting",
        schema: PrefillWireSchema,
        system: SETUP_PREFILL_INSTRUCTION,
        prompt: [
          prompt,
          SETUP_REPAIR_INSTRUCTION,
          encodePromptJson([result.rejection ?? "The answer could not be read."]),
        ].join("\n"),
      });
    }
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
        `Interview language: ${setupLanguageName(setupLanguage(setup.answers))}.`,
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
    const sheet = await loadSetupSpreadsheet(
      setup.hasSpreadsheet ? await this.repo.readSpreadsheet(setup.id) : null,
      language,
    );
    return this.planner.plan({
      setupId: setup.id,
      language,
      currency: setupCurrency(setup.answers) ?? "EUR",
      answers: setup.answers,
      followUps: setup.interview.followUpQuestions.map((question) => ({
        question: question.label,
        format: question.format,
        ...("options" in question ? { options: question.options } : {}),
        answer: setup.interview.followUpAnswers.find((answer) => answer.id === question.id)?.value ?? null,
      })),
      sources: setup.crawlId ? await this.repo.crawlSources(setup.crawlId) : [],
      sheet,
    });
  }
}
