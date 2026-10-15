import type { WorkspaceSetupRepo } from "./workspace-setup.repo";
import type { StoredSetupInterview, WorkspaceSetupFailure, WorkspaceSetupRecord } from "./workspace-setup.schema";
import type { WorkspaceSetupModelService } from "./workspace-setup-model.service";
import type {
  SetupPlanInput,
  SetupPlanOutcome,
  SetupPlanPart,
  SetupPlanPartState,
  WorkspaceSetupPlanner,
} from "./workspace-setup-planner";

import { UserAccessor } from "@/core/base/user-accessor";
import { mergeWebsitePrefill } from "@/features/workspace-setup/setup-prefill";
import { APP_LOCALES } from "@/i18n/locale-registry";
import { untrustedText } from "@/features/mcp-tools/untrusted-record-content";

import {
  FollowUpWireSchema,
  PlanKnowledgeWireSchema,
  PlanModelWireSchema,
  PlanViewsWireSchema,
  PrefillWireSchema,
  followUpQuestions,
  prefillAnswers,
} from "./workspace-setup-wire";
import { SETUP_PLAN_PARTS, SetupPlanPartStateSchema, emptySetupPlanPart } from "./workspace-setup-planner";
import {
  SETUP_FOLLOW_UP_INSTRUCTION,
  SETUP_REPAIR_INSTRUCTION,
  SETUP_PREFILL_INSTRUCTION,
  encodePromptJson,
  setupInterviewCatalog,
  setupLanguageName,
} from "./workspace-setup-prompts";
import { answersForPrompt, loadSetupSpreadsheet, setupCurrency, setupLanguage } from "./workspace-setup-inputs";
import { setupWebsiteText } from "./workspace-setup-website";

export const SETUP_GENERATION_STALE_MS = 15 * 60 * 1_000;
const PREFILL_WEBSITE = { characters: 36_000, perSource: 3_000 };
const CRAWL_READING = new Set(["queued", "discovering", "fetching"]);

type Claimable = "prefill" | "plan";
type PlanClaim = { status: "claimed"; revision: number } | { status: "busy" | "skip" };

function planPartKey(part: SetupPlanPart): string {
  return `plan:${part}`;
}

function planPartState(setup: WorkspaceSetupRecord, part: SetupPlanPart): SetupPlanPartState {
  const stored = SetupPlanPartStateSchema.safeParse(setup.artifacts[planPartKey(part)]);
  return stored.success && stored.data.revision === setup.planRevision
    ? stored.data
    : emptySetupPlanPart(setup.planRevision);
}

function planDrafts(setup: WorkspaceSetupRecord) {
  const model = PlanModelWireSchema.safeParse(planPartState(setup, "model").value);
  const knowledge = PlanKnowledgeWireSchema.safeParse(planPartState(setup, "knowledge").value);
  const views = PlanViewsWireSchema.safeParse(planPartState(setup, "views").value);
  return {
    model: model.success ? model.data : null,
    knowledge: knowledge.success ? knowledge.data : null,
    views: views.success ? views.data : null,
  };
}

function planFailure(setup: WorkspaceSetupRecord): WorkspaceSetupFailure {
  const failures = SETUP_PLAN_PARTS.flatMap((part) => planPartState(setup, part).failure ?? []);
  return failures.includes("spendCap") ? "spendCap" : (failures[0] ?? "generation");
}

function withoutPlanParts(artifacts: Record<string, unknown>, keep: (part: SetupPlanPart) => boolean) {
  return Object.fromEntries(
    Object.entries(artifacts).filter(([key]) =>
      SETUP_PLAN_PARTS.every((part) => key !== planPartKey(part) || keep(part)),
    ),
  );
}

function planning(setup: WorkspaceSetupRecord, revision: number) {
  return setup.status === "planning" && setup.planRevision === revision && setup.interview.plan === "running";
}

function stale(claimedAt: string | null, now: Date) {
  return !claimedAt || new Date(claimedAt).getTime() < now.getTime() - SETUP_GENERATION_STALE_MS;
}

export class WorkspaceSetupInterviewService extends UserAccessor {
  constructor(
    private repo: WorkspaceSetupRepo,
    private models: Pick<WorkspaceSetupModelService, "generate" | "drainWarnings">,
    private planner: Pick<WorkspaceSetupPlanner, "attempt" | "assemble">,
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

  async claimPlan(setupId: string): Promise<PlanClaim> {
    const claimed = await this.claim(setupId, "plan", ["queued"]);
    if (claimed) return { status: "claimed", revision: claimed.planRevision };
    const setup = await this.repo.get(setupId);
    return setup?.status === "planning" && setup.interview.plan === "running" ? { status: "busy" } : { status: "skip" };
  }

  async planPart(
    setupId: string,
    revision: number,
    part: SetupPlanPart,
  ): Promise<"done" | "retry" | "failed" | "skip"> {
    const setup = await this.repo.get(setupId);
    if (!setup || !planning(setup, revision)) return "skip";
    const state = planPartState(setup, part);
    if (state.value !== null && state.value !== undefined) return "done";
    if (state.failure) return "failed";
    const { model, knowledge } = planDrafts(setup);
    const next = await this.planner.attempt(part, await this.planInput(setup), state, { model, knowledge });
    const stored = await this.repo.mutate(setupId, (current) =>
      planning(current, revision) ? { artifacts: { ...current.artifacts, [planPartKey(part)]: next } } : null,
    );
    if (!stored?.changed) return "skip";
    if (next.value !== null && next.value !== undefined) return "done";
    return next.failure ? "failed" : "retry";
  }

  async finishPlan(setupId: string, revision: number, final: boolean): Promise<"planned" | "retry" | "failed" | "skip"> {
    const setup = await this.repo.get(setupId);
    if (!setup || !planning(setup, revision)) return "skip";
    const drafts = planDrafts(setup);
    const outcome: SetupPlanOutcome =
      drafts.model && drafts.knowledge && drafts.views
        ? await this.planner.assemble(await this.planInput(setup), {
            model: drafts.model,
            knowledge: drafts.knowledge,
            views: drafts.views,
          })
        : { ok: false, failure: planFailure(setup) };
    const retry = !outcome.ok && !final && outcome.failure !== "spendCap";
    const assembled = Boolean(drafts.model && drafts.knowledge && drafts.views);
    const updated = await this.repo.mutate(setupId, (current) => {
      if (!planning(current, revision)) return null;
      if (outcome.ok)
        return {
          status: "planned",
          plan: outcome.plan,
          artifacts: withoutPlanParts(current.artifacts, () => false),
          interview: { ...current.interview, plan: "completed", planError: null, planClaimedAt: null },
        };
      if (retry)
        return {
          artifacts: withoutPlanParts(
            current.artifacts,
            (part) => !assembled && planPartState(current, part).failure === null && drafts[part] !== null,
          ),
          interview: { ...current.interview, plan: "queued", planClaimedAt: null },
        };
      return {
        status: "interview",
        artifacts: withoutPlanParts(current.artifacts, () => false),
        interview: { ...current.interview, plan: "failed", planError: outcome.failure, planClaimedAt: null },
      };
    });
    if (!updated?.changed) return "skip";
    return outcome.ok ? "planned" : retry ? "retry" : "failed";
  }

  private async planInput(setup: WorkspaceSetupRecord): Promise<SetupPlanInput> {
    const language = setupLanguage(setup.answers);
    const sheet = await loadSetupSpreadsheet(
      setup.hasSpreadsheet ? await this.repo.readSpreadsheet(setup.id) : null,
      language,
    );
    const drafted = setup.interview.prefillDraft?.language?.value;
    return {
      setupId: setup.id,
      language,
      answersLanguage: drafted?.format === "singleChoice" ? drafted.value : null,
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
    };
  }
}
