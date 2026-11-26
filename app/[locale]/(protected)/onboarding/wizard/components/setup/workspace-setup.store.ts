import type { RootStore } from "@/core/stores/root.store";
import type { SerializedInteractorFailure } from "@/core/validation/validation.utils";
import type { SetupAnswerValue, SetupAnswers } from "@/features/workspace-setup/setup-answers.schema";
import type { SetupQuestion } from "@/features/workspace-setup/setup-interview";
import type { SetupStepSuggestion } from "@/features/workspace-setup/setup-solution-match";
import type { WorkspaceSetupStatusView, WorkspaceSetupView } from "@/ee/workspace-setup/workspace-setup-status";
import type { WorkspaceSetupPhase } from "@/ee/workspace-setup/workspace-setup.schema";
import type { SetupStage } from "./setup-interview-state";

import { makeAutoObservable, observable, runInAction, toJS } from "mobx";

import { touchAnswer } from "@/features/workspace-setup/setup-answers.schema";
import { SETUP_QUESTIONS, setupQuestionVisible } from "@/features/workspace-setup/setup-interview";
import { setupStepSuggestion } from "@/features/workspace-setup/setup-solution-match";
import { serializedFailureErrorTree } from "@/core/validation/validation.utils";
import { toastZodErrorTree } from "@/core/utils/toast-zod-error-tree";
import { notifyIfWorkspaceChanged, notifyWorkspaceChanged } from "@/core/errors/workspace-changed-notice";
import { isAppLocale } from "@/i18n/locale-registry";

import {
  adjustWorkspaceSetupAction,
  confirmWorkspaceSetupAction,
  getWorkspaceSetupStatusAction,
  planWorkspaceSetupAction,
  retryWorkspaceSetupPhaseAction,
  saveWorkspaceSetupAnswersAction,
  startWorkspaceSetupAction,
} from "../../workspace-setup-actions";

import {
  answersPayload,
  displayedFollowUpValue,
  mergeServerAnswers,
  missingParts,
  answerComplete,
  resolveSetupStage,
  sanitizeAnswerValue,
  unansweredFollowUps,
} from "./setup-interview-state";

type SetupCommand = "start" | "save" | "plan" | "followUps" | "build" | "retry";

const POLLED_GENERATION = new Set(["queued", "running"]);
const ADJUSTABLE_STAGES = new Set<SetupStage>(["plan", "planFailed"]);

export class WorkspaceSetupStore {
  view: WorkspaceSetupStatusView | null = null;
  answers: SetupAnswers = {};
  touched = observable.set<string>();
  followUpDrafts: Record<string, SetupAnswerValue> = {};
  questionIndex = 0;
  adjusting = false;
  missingShown = false;
  pending: SetupCommand | null = null;
  private hydratedSetupId: string | null | undefined = undefined;
  private refreshGeneration = 0;

  constructor(public readonly rootStore: RootStore) {
    makeAutoObservable<this, "hydratedSetupId" | "refreshGeneration">(this, {
      rootStore: false,
      hydratedSetupId: false,
      refreshGeneration: false,
    });
  }

  get locale(): string {
    return this.rootStore.localeStore.locale;
  }

  get currency(): string | null {
    const currency = this.answers.currency?.value;
    return currency?.format === "singleChoice" ? currency.value : null;
  }

  get setup(): WorkspaceSetupView | null {
    return this.view?.available ? this.view.setup : null;
  }

  get stage(): SetupStage {
    const stage = resolveSetupStage(this.view);
    return this.adjusting && ADJUSTABLE_STAGES.has(stage) ? "interview" : stage;
  }

  get questions(): SetupQuestion[] {
    return SETUP_QUESTIONS.filter((question) => setupQuestionVisible(question, this.answers));
  }

  get currentQuestion(): SetupQuestion {
    return this.questions[Math.min(this.questionIndex, this.questions.length - 1)];
  }

  get questionNumber(): number {
    return Math.min(this.questionIndex, this.questions.length - 1) + 1;
  }

  get isLastQuestion(): boolean {
    return this.questionNumber >= this.questions.length;
  }

  get stepSuggestion(): SetupStepSuggestion | null {
    return this.answers.mainSteps ? null : setupStepSuggestion(this.answers);
  }

  get isBusy(): boolean {
    return this.pending !== null;
  }

  get missingAnswers(): string[] {
    const setup = this.setup;
    if (this.stage === "followUps" && setup) {
      return this.pendingFollowUps
        .filter((question) => !answerComplete(question, displayedFollowUpValue(question, setup, this.followUpDrafts)))
        .map((question) => question.id);
    }
    return missingParts(this.answers);
  }

  get currentMissing(): string[] {
    if (this.stage === "followUps") return this.missingAnswers;
    const ids = new Set(this.currentQuestion.parts.map((part) => part.id));
    return this.missingAnswers.filter((id) => ids.has(id));
  }

  get canContinue(): boolean {
    return this.currentMissing.length === 0;
  }

  get pendingFollowUps() {
    return this.setup ? unansweredFollowUps(this.setup) : [];
  }

  get canConfirmFollowUps(): boolean {
    return Boolean(this.setup) && this.missingAnswers.length === 0;
  }

  answerMissing = (id: string): boolean => this.missingShown && this.missingAnswers.includes(id);

  showMissingAnswers = (message: string): boolean => {
    this.missingShown = this.currentMissing.length > 0;
    if (this.missingShown) toastZodErrorTree({ errors: [message] });
    return this.missingShown;
  };

  get shouldPoll(): boolean {
    const setup = this.setup;
    if (!setup) return false;
    if (setup.status === "planning" || setup.status === "building") return true;
    return setup.status === "interview" && POLLED_GENERATION.has(setup.plan.status);
  }

  hydrate = (view: WorkspaceSetupStatusView) => {
    this.view = view;
    const setup = view.available ? view.setup : null;
    const setupId = setup?.id ?? null;
    if (setupId !== this.hydratedSetupId) {
      this.hydratedSetupId = setupId;
      this.answers = setup?.interview.answers ?? {};
      this.touched.clear();
      this.followUpDrafts = {};
      this.questionIndex = 0;
      this.adjusting = false;
      this.missingShown = false;
      return;
    }
    if (setup) this.answers = mergeServerAnswers(this.answers, this.touched, setup.interview.answers);
  };

  setAnswer = (id: string, value: SetupAnswerValue) => {
    this.answers = touchAnswer(this.answers, id, value);
    this.touched.add(id);
  };

  setFollowUpAnswer = (id: string, value: SetupAnswerValue) => {
    this.followUpDrafts = { ...this.followUpDrafts, [id]: value };
  };

  nextQuestion = (message: string, suggestedSteps: readonly string[] = []): boolean => {
    if (this.isBusy || this.showMissingAnswers(message)) return false;
    if (this.currentQuestion.id === "mainSteps" && !this.answers.mainSteps && suggestedSteps.length)
      this.setAnswer("mainSteps", { format: "orderedList", items: suggestedSteps.map((label) => ({ label })) });
    this.missingShown = false;
    if (this.isLastQuestion) return true;
    this.questionIndex = this.questionNumber;
    return false;
  };

  previousQuestion = (): boolean => {
    if (this.isBusy || this.questionNumber <= 1) return false;
    this.missingShown = false;
    this.questionIndex = this.questionNumber - 2;
    return true;
  };

  get canChangeAnswers(): boolean {
    return !this.isBusy && ADJUSTABLE_STAGES.has(resolveSetupStage(this.view));
  }

  changeAnswer = (questionId: string) => {
    if (!this.canChangeAnswers) return;
    const index = this.questions.findIndex((question) => question.id === questionId);
    if (index === -1) return;
    this.adjusting = true;
    this.missingShown = false;
    this.questionIndex = index;
  };

  discardAdjustment = () => {
    if (this.isBusy || !this.adjusting) return;
    this.adjusting = false;
    this.missingShown = false;
    this.answers = this.setup?.interview.answers ?? {};
    this.touched.clear();
  };

  private belongsToOtherWorkspace(view: WorkspaceSetupStatusView) {
    const setupId = view.available ? (view.setup?.id ?? null) : null;
    return typeof this.hydratedSetupId === "string" && setupId !== this.hydratedSetupId;
  }

  refresh = async () => {
    const generation = this.refreshGeneration;
    const result = await getWorkspaceSetupStatusAction();
    if (generation !== this.refreshGeneration) return false;
    if (notifyIfWorkspaceChanged(result)) return false;
    if (result.ok && this.belongsToOtherWorkspace(result.data)) {
      notifyWorkspaceChanged();
      return false;
    }
    if (result.ok) this.hydrate(result.data);
    return result.ok;
  };

  poll = () => (this.isBusy ? Promise.resolve(false) : this.refresh());

  start = () =>
    this.run("start", async () => {
      const result = await startWorkspaceSetupAction({ locale: this.appLocale });
      if (result.ok) await this.refresh();
      return result;
    });

  showPlan = () =>
    this.run("save", async () => {
      const setup = this.setup;
      if (!setup || this.missingAnswers.length) return null;
      const answers = toJS(answersPayload(toJS(this.answers)));
      if (this.adjusting && setup.status === "planned") {
        const adjusted = await adjustWorkspaceSetupAction({ setupId: setup.id, answers, followUpAnswers: [] });
        if (adjusted.ok) await this.planRequested();
        return adjusted;
      }
      const saved = await saveWorkspaceSetupAnswersAction({ setupId: setup.id, answers, followUpAnswers: [] });
      return saved.ok ? this.requestPlan(setup.id) : saved;
    });

  confirmFollowUps = () =>
    this.run("followUps", async () => {
      const setup = this.setup;
      if (!setup || !this.canConfirmFollowUps) return null;
      const followUpAnswers = this.pendingFollowUps.flatMap((question) => {
        const value = displayedFollowUpValue(question, setup, this.followUpDrafts);
        return value ? [{ id: question.id, value: toJS(sanitizeAnswerValue(value)) }] : [];
      });
      const saved = await saveWorkspaceSetupAnswersAction({ setupId: setup.id, answers: {}, followUpAnswers });
      if (!saved.ok) return saved;
      const planned = await planWorkspaceSetupAction({ setupId: setup.id });
      if (planned.ok) await this.refresh();
      return planned;
    });

  replan = () =>
    this.run("plan", async () => {
      const setup = this.setup;
      if (!setup) return null;
      const planned = await planWorkspaceSetupAction({ setupId: setup.id });
      if (planned.ok) await this.refresh();
      return planned;
    });

  build = () =>
    this.run("build", async () => {
      const setup = this.setup;
      if (!setup || setup.status !== "planned") return null;
      const confirmed = await confirmWorkspaceSetupAction({ setupId: setup.id, planRevision: setup.plan.revision });
      if (confirmed.ok) await this.refresh();
      return confirmed;
    });

  retryPhase = (phase: WorkspaceSetupPhase) =>
    this.run("retry", async () => {
      const setup = this.setup;
      if (!setup) return null;
      const retried = await retryWorkspaceSetupPhaseAction({ setupId: setup.id, phase });
      if (retried.ok) await this.refresh();
      return retried;
    });

  private get appLocale() {
    return isAppLocale(this.locale) ? this.locale : undefined;
  }

  private async requestPlan(setupId: string) {
    const planned = await planWorkspaceSetupAction({ setupId });
    if (planned.ok) await this.planRequested();
    return planned;
  }

  private async planRequested() {
    runInAction(() => {
      this.adjusting = false;
    });
    await this.refresh();
  }

  private async run(
    command: SetupCommand,
    perform: () => Promise<{ ok: true } | { ok: false; failure: SerializedInteractorFailure } | null>,
  ): Promise<boolean> {
    if (this.pending) return false;
    this.pending = command;
    this.refreshGeneration += 1;
    try {
      const result = await perform();
      if (result && !result.ok) {
        if (notifyIfWorkspaceChanged(result.failure)) return false;
        toastZodErrorTree(serializedFailureErrorTree(result.failure));
        if (result.failure.kind === "conflict") await this.refresh();
      }
      return result?.ok ?? false;
    } finally {
      runInAction(() => {
        this.pending = null;
      });
    }
  }
}
