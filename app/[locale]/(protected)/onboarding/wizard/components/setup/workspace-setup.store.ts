import type { RootStore } from "@/core/stores/root.store";
import type { SerializedInteractorFailure } from "@/core/validation/validation.utils";
import type { SetupAnswerValue, SetupAnswers } from "@/features/workspace-setup/setup-answers.schema";
import type { WorkspaceSetupStatusView, WorkspaceSetupView } from "@/ee/workspace-setup/workspace-setup-status";
import type { WorkspaceSetupPhase } from "@/ee/workspace-setup/workspace-setup.schema";
import type { SpreadsheetReadFailureCode } from "@/features/data-transfer/spreadsheet/spreadsheet.schema";
import type { SetupStage } from "./setup-interview-state";

import { action, makeAutoObservable, observable, runInAction, toJS } from "mobx";

import { SPREADSHEET_MAX_FILE_BYTES } from "@/features/data-transfer/spreadsheet/spreadsheet.schema";
import { SETUP_SCREENS } from "@/features/workspace-setup/setup-interview";
import { touchAnswer } from "@/features/workspace-setup/setup-prefill";
import { serializedFailureErrorTree } from "@/core/validation/validation.utils";
import { toastZodErrorTree } from "@/core/utils/toast-zod-error-tree";
import { isAppLocale } from "@/i18n/locale-registry";

import {
  adjustWorkspaceSetupAction,
  confirmWorkspaceSetupAction,
  getWorkspaceSetupStatusAction,
  planWorkspaceSetupAction,
  retryWorkspaceSetupPhaseAction,
  saveWorkspaceSetupAnswersAction,
  startWorkspaceSetupAction,
  uploadWorkspaceSetupSpreadsheetAction,
} from "../../workspace-setup-actions";

import {
  answerComplete,
  displayedFollowUpValue,
  interviewAnswersPayload,
  mergeServerAnswers,
  resolveSetupStage,
  resumeScreenIndex,
  sanitizeAnswerValue,
  screenAnswersPayload,
  screenComplete,
  unansweredFollowUps,
} from "./setup-interview-state";

export type SetupCommand = "start" | "save" | "plan" | "followUps" | "build" | "retry" | "upload" | "refresh";

export type SpreadsheetRejection = { fileName: string; failure: SpreadsheetReadFailureCode };

const POLLED_GENERATION = new Set(["queued", "running"]);
const ADJUSTABLE_STAGES = new Set<SetupStage>(["plan", "planFailed"]);

export class WorkspaceSetupStore {
  view: WorkspaceSetupStatusView | null = null;
  answers: SetupAnswers = {};
  touched = observable.set<string>();
  followUpDrafts: Record<string, SetupAnswerValue> = {};
  screenIndex = 0;
  adjusting = false;
  spreadsheetRejection: SpreadsheetRejection | null = null;
  pending: SetupCommand | null = null;
  locale = "en";
  private hydratedSetupId: string | null | undefined = undefined;

  constructor(public readonly rootStore: RootStore) {
    makeAutoObservable<this, "hydratedSetupId">(this, {
      rootStore: false,
      hydratedSetupId: false,
      hydrate: action,
      setLocale: action,
    });
  }

  get setup(): WorkspaceSetupView | null {
    return this.view?.available ? this.view.setup : null;
  }

  get stage(): SetupStage {
    const stage = resolveSetupStage(this.view);
    return this.adjusting && ADJUSTABLE_STAGES.has(stage) ? "interview" : stage;
  }

  get screen() {
    return SETUP_SCREENS[this.screenIndex];
  }

  get isLastScreen(): boolean {
    return this.screenIndex === SETUP_SCREENS.length - 1;
  }

  get isBusy(): boolean {
    return this.pending !== null;
  }

  get needsSpreadsheet(): boolean {
    const value = this.answers.existingData?.value;
    return value?.format === "singleChoice" && value.value === "spreadsheet" && !this.setup?.spreadsheet;
  }

  get canConfirmScreen(): boolean {
    if (this.screen === "data" && this.needsSpreadsheet) return false;
    return screenComplete(this.screen, this.answers, this.locale);
  }

  get pendingFollowUps() {
    return this.setup ? unansweredFollowUps(this.setup) : [];
  }

  get canConfirmFollowUps(): boolean {
    const setup = this.setup;
    if (!setup) return false;
    return this.pendingFollowUps.every((question) =>
      answerComplete(question, displayedFollowUpValue(question, setup, this.followUpDrafts)),
    );
  }

  get shouldPoll(): boolean {
    const setup = this.setup;
    if (!setup) return false;
    if (setup.status === "planning" || setup.status === "building") return true;
    if (setup.status !== "interview") return false;
    return POLLED_GENERATION.has(setup.interview.prefill) || POLLED_GENERATION.has(setup.plan.status);
  }

  get prefillRunning(): boolean {
    const setup = this.setup;
    return Boolean(setup?.websiteUrl) && POLLED_GENERATION.has(setup?.interview.prefill ?? "idle");
  }

  setLocale = (locale: string) => {
    this.locale = locale;
  };

  hydrate = (view: WorkspaceSetupStatusView) => {
    this.view = view;
    const setup = view.available ? view.setup : null;
    const setupId = setup?.id ?? null;
    if (setupId !== this.hydratedSetupId) {
      this.hydratedSetupId = setupId;
      this.answers = setup?.interview.answers ?? {};
      this.touched.clear();
      this.followUpDrafts = {};
      this.adjusting = false;
      this.spreadsheetRejection = null;
      this.screenIndex = resumeScreenIndex(this.answers);
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

  previousScreen = () => {
    if (this.isBusy) return;
    if (this.screenIndex === 0) {
      if (this.adjusting) this.discardAdjustment();
      return;
    }
    this.screenIndex -= 1;
  };

  adjust = () => {
    if (this.isBusy) return;
    this.adjusting = true;
    this.screenIndex = 0;
  };

  refresh = async () => {
    const result = await getWorkspaceSetupStatusAction();
    if (result.ok) this.hydrate(result.data);
    return result.ok;
  };

  start = (websiteUrl: string | null) =>
    this.run("start", async () => {
      const result = await startWorkspaceSetupAction({ websiteUrl, locale: this.appLocale });
      if (result.ok) await this.refresh();
      return result;
    });

  confirmScreen = () => {
    if (this.adjusting && !this.isLastScreen) return Promise.resolve(this.nextAdjustedScreen());
    return this.run("save", async () => {
      const setup = this.setup;
      if (!setup || !this.canConfirmScreen) return null;
      if (this.adjusting) return this.submitAdjustment(setup);
      const answers = toJS(screenAnswersPayload(this.screen, toJS(this.answers), this.locale));
      const saved = await saveWorkspaceSetupAnswersAction({ setupId: setup.id, answers, followUpAnswers: [] });
      if (!saved.ok) return saved;
      if (!this.isLastScreen) {
        runInAction(() => {
          this.screenIndex += 1;
        });
        return saved;
      }
      return this.requestPlan(setup.id);
    });
  };

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
      if (!setup) return null;
      const confirmed = await confirmWorkspaceSetupAction({ setupId: setup.id, planRevision: setup.plan.revision });
      if (confirmed.ok) await this.refresh();
      return confirmed;
    });

  retryPhase = (phase: WorkspaceSetupPhase, withoutWebsite = false) =>
    this.run("retry", async () => {
      const setup = this.setup;
      if (!setup) return null;
      const retried = await retryWorkspaceSetupPhaseAction({
        setupId: setup.id,
        phase,
        ...(withoutWebsite ? { withoutWebsite } : {}),
      });
      if (retried.ok) await this.refresh();
      return retried;
    });

  uploadSpreadsheet = (file: File) =>
    this.run("upload", async () => {
      const setup = this.setup;
      if (!setup) return null;
      if (file.size > SPREADSHEET_MAX_FILE_BYTES) {
        this.spreadsheetRejection = { fileName: file.name, failure: "fileTooLarge" };
        return null;
      }
      const formData = new FormData();
      formData.set("setupId", setup.id);
      formData.set("file", file);
      const uploaded = await uploadWorkspaceSetupSpreadsheetAction(formData);
      if (!uploaded.ok) return uploaded;
      runInAction(() => {
        this.spreadsheetRejection = uploaded.data.accepted
          ? null
          : { fileName: file.name, failure: uploaded.data.failure };
      });
      if (uploaded.data.accepted) await this.refresh();
      return uploaded;
    });

  private get appLocale() {
    return isAppLocale(this.locale) ? this.locale : undefined;
  }

  private nextAdjustedScreen(): boolean {
    if (this.isBusy || !this.setup || !this.canConfirmScreen) return false;
    this.screenIndex += 1;
    return true;
  }

  private discardAdjustment() {
    this.adjusting = false;
    this.answers = this.setup?.interview.answers ?? {};
    this.touched.clear();
  }

  private async submitAdjustment(setup: WorkspaceSetupView) {
    const answers = toJS(interviewAnswersPayload(toJS(this.answers), this.locale));
    if (setup.status !== "planned") {
      const saved = await saveWorkspaceSetupAnswersAction({ setupId: setup.id, answers, followUpAnswers: [] });
      return saved.ok ? this.requestPlan(setup.id) : saved;
    }
    const adjusted = await adjustWorkspaceSetupAction({ setupId: setup.id, answers, followUpAnswers: [] });
    if (adjusted.ok) await this.planRequested();
    return adjusted;
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
    try {
      const result = await perform();
      if (result && !result.ok) {
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
