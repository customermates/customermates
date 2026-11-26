import type { WorkspaceSetupRepo } from "./workspace-setup.repo";
import type { SetupPlan } from "@/features/workspace-setup/setup-plan.schema";
import type { WorkspaceSetupFailure, WorkspaceSetupPatch, WorkspaceSetupRecord } from "./workspace-setup.schema";
import type { WorkspaceSetupModelService } from "./workspace-setup-model.service";
import type {
  SetupPlanInput,
  SetupPlanOutcome,
  SetupPlanPart,
  SetupPlanPartState,
  WorkspaceSetupPlanner,
} from "./workspace-setup-planner";

import { UserAccessor } from "@/core/base/user-accessor";
import { untrustedText } from "@/features/mcp-tools/untrusted-record-content";

import {
  FollowUpWireSchema,
  PlanKnowledgeWireSchema,
  PlanModelWireSchema,
  PlanViewsWireSchema,
  followUpQuestions,
} from "./workspace-setup-wire";
import { SETUP_PLAN_PARTS, SetupPlanPartStateSchema, emptySetupPlanPart } from "./workspace-setup-planner";
import {
  SETUP_FOLLOW_UP_INSTRUCTION,
  encodePromptJson,
  setupInterviewCatalog,
  setupLanguageName,
} from "./workspace-setup-prompts";
import { answersForPrompt, loadSetupSpreadsheet, setupCurrency, setupLanguage } from "./workspace-setup-inputs";

export const SETUP_GENERATION_STALE_MS = 15 * 60 * 1_000;
export const SETUP_PLAN_QUEUE_STALE_MS = 5 * 60 * 1_000;

export type PlanClaim = { status: "claimed"; revision: number } | { status: "planned" | "busy" | "skip" };

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

function plannedPatch(setup: WorkspaceSetupRecord, plan: SetupPlan): WorkspaceSetupPatch {
  return {
    status: "planned",
    plan,
    artifacts: withoutPlanParts(setup.artifacts, () => false),
    interview: { ...setup.interview, plan: "completed", planError: null, planClaimedAt: null },
  };
}

function stale(claimedAt: string | null, now: Date, limitMs = SETUP_GENERATION_STALE_MS) {
  return !claimedAt || new Date(claimedAt).getTime() < now.getTime() - limitMs;
}

export function setupPlanStalled(setup: Pick<WorkspaceSetupRecord, "status" | "interview">, now: Date): boolean {
  if (setup.status !== "planning") return false;
  const { plan, planClaimedAt, planQueuedAt } = setup.interview;
  if (plan === "running") return stale(planClaimedAt, now);
  return plan === "queued" && stale(planQueuedAt, now, SETUP_PLAN_QUEUE_STALE_MS);
}

export type SetupPlanPartProgress = "waiting" | "running" | "done";

export function setupPlanProgress(setup: WorkspaceSetupRecord): Record<SetupPlanPart, SetupPlanPartProgress> {
  const done = (part: SetupPlanPart) => {
    const value = planPartState(setup, part).value;
    return value !== null && value !== undefined;
  };
  const running = setup.status === "planning" && setup.interview.plan === "running";
  const state = (part: SetupPlanPart, ready: boolean): SetupPlanPartProgress =>
    done(part) || setup.status === "planned" ? "done" : running && ready ? "running" : "waiting";
  return { model: state("model", true), knowledge: state("knowledge", true), views: state("views", done("model")) };
}

export class WorkspaceSetupInterviewService extends UserAccessor {
  constructor(
    private repo: WorkspaceSetupRepo,
    private models: Pick<WorkspaceSetupModelService, "generate" | "drainWarnings">,
    private planner: Pick<WorkspaceSetupPlanner, "attempt" | "assemble" | "fromTemplate">,
  ) {
    super();
  }

  drainWarnings(): string[] {
    return this.models.drainWarnings();
  }

  private async claimPlanRun(setupId: string) {
    const now = new Date();
    const claimed = await this.repo.mutate(setupId, (setup) => {
      if (setup.status !== "planning") return null;
      const state = setup.interview.plan;
      if (state !== "queued" && !(state === "running" && stale(setup.interview.planClaimedAt, now))) return null;
      return { interview: { ...setup.interview, plan: "running", planClaimedAt: now.toISOString() } };
    });
    return claimed?.changed ? claimed.setup : null;
  }

  async followUps(setupId: string): Promise<"asked" | "none" | "skip"> {
    const setup = await this.repo.get(setupId);
    if (!setup || setup.status !== "planning") return "skip";
    if (setup.interview.followUps !== "idle") return "none";
    if (setup.interview.templateSlug) {
      await this.repo.mutate(setupId, (current) =>
        current.status === "planning" && current.interview.followUps === "idle"
          ? { interview: { ...current.interview, followUps: "skipped" } }
          : null,
      );
      return "none";
    }
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

  async abandonPlan(setupId: string, revision: number | null): Promise<void> {
    await this.repo.mutate(setupId, (setup) => {
      if (setup.status !== "planning" || (revision !== null && setup.planRevision !== revision)) return null;
      return {
        status: "interview",
        artifacts: withoutPlanParts(setup.artifacts, () => false),
        interview: { ...setup.interview, plan: "failed", planError: "error", planClaimedAt: null },
      };
    });
  }

  async claimPlan(setupId: string): Promise<PlanClaim> {
    const claimed = await this.claimPlanRun(setupId);
    if (!claimed) {
      const setup = await this.repo.get(setupId);
      return setup?.status === "planning" && setup.interview.plan === "running"
        ? { status: "busy" }
        : { status: "skip" };
    }
    const revision = claimed.planRevision;
    const templated = claimed.interview.templateSlug
      ? await this.planner.fromTemplate(await this.planInput(claimed))
      : null;
    if (!templated?.ok) return { status: "claimed", revision };
    const stored = await this.repo.mutate(setupId, (current) =>
      planning(current, revision) ? plannedPatch(current, templated.plan) : null,
    );
    return { status: stored?.changed ? "planned" : "skip" };
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
    if (!(await this.heartbeatPlan(setupId, revision))) return "skip";
    const next = await this.planner.attempt(part, await this.planInput(setup), state, { model, knowledge });
    const stored = await this.repo.mutate(setupId, (current) =>
      planning(current, revision)
        ? {
            artifacts: { ...current.artifacts, [planPartKey(part)]: next },
            interview: { ...current.interview, planClaimedAt: new Date().toISOString() },
          }
        : null,
    );
    if (!stored?.changed) return "skip";
    if (next.value !== null && next.value !== undefined) return "done";
    return next.failure ? "failed" : "retry";
  }

  private async heartbeatPlan(setupId: string, revision: number): Promise<boolean> {
    const beat = await this.repo.mutate(setupId, (current) =>
      planning(current, revision)
        ? { interview: { ...current.interview, planClaimedAt: new Date().toISOString() } }
        : null,
    );
    return Boolean(beat?.changed);
  }

  async finishPlan(
    setupId: string,
    revision: number,
    final: boolean,
  ): Promise<"planned" | "retry" | "failed" | "skip"> {
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
      if (outcome.ok) return plannedPatch(current, outcome.plan);
      if (retry) {
        return {
          artifacts: withoutPlanParts(
            current.artifacts,
            (part) => !assembled && planPartState(current, part).failure === null && drafts[part] !== null,
          ),
          interview: {
            ...current.interview,
            plan: "queued",
            planClaimedAt: null,
            planQueuedAt: new Date().toISOString(),
          },
        };
      }
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
    return {
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
      sheet,
      templateSlug: setup.interview.templateSlug,
    };
  }
}
