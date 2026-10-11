import type { RootStore } from "@/core/stores/root.store";
import type { TypedActionResult } from "@/core/utils/action-result";
import type { SetupAnswerValue, SetupAnswers } from "@/features/workspace-setup/setup-answers.schema";
import type { WorkspaceSetupStatusView, WorkspaceSetupView } from "@/ee/workspace-setup/workspace-setup-status";
import type { WorkspaceSetupPhase } from "@/ee/workspace-setup/workspace-setup.schema";
import type { SetupStage } from "./setup-interview-state";

import { makeAutoObservable, observable, runInAction } from "mobx";

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
  useStandardWorkspaceSetupAction as applyStandardWorkspaceSetupAction,
} from "../../workspace-setup-actions";

import {
  answerComplete,
  displayedFollowUpValue,
  mergeServerAnswers,
  resolveSetupStage,
  resumeScreenIndex,
  sanitizeAnswerValue,
  screenAnswersPayload,
  screenComplete,
  unansweredFollowUps,
} from "./setup-interview-state";

export type SetupCommand =
  | "start"
  | "save"
  | "plan"
  | "followUps"
  | "build"
  | "retry"
  | "standard"
  | "upload"
  | "refresh";

const POLLED_GENERATION = new Set(["queued", "running"]);

export class WorkspaceSetupStore {
  view: WorkspaceSetupStatusView | null = null;
  answers: SetupAnswers = {};
  touched = observable.set<string>();
  followUpDrafts: Record<string, SetupAnswerValue> = {};
  screenIndex = 0;
  adjusting = false;
  pending: SetupCommand | null = null;
  locale = "en";
  private hydratedSetupId: string | null | undefined = undefined;

  constructor(public readonly rootStore: RootStore) {
    makeAutoObservable<this, "hydratedSetupId">(this, { rootStore: false, hydratedSetupId: false });
  }

  get setup(): WorkspaceSetupView | null {
    return this.view?.available ? this.view.setup : null;
  }

  get stage(): SetupStage {
    const stage = resolveSetupStage(this.view);
    return this.adjusting && stage === "plan" ? "interview" : stage;
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
      if (this.adjusting) this.adjusting = false;
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

  confirmScreen = () =>
    this.run("save", async () => {
      const setup = this.setup;
      if (!setup || !this.canConfirmScreen) return null;
      const answers = screenAnswersPayload(this.screen, this.answers, this.locale);
      if (this.isLastScreen && this.adjusting) {
        const adjusted = await adjustWorkspaceSetupAction({ setupId: setup.id, answers, followUpAnswers: [] });
        if (adjusted.ok) {
          runInAction(() => {
            this.adjusting = false;
          });
          await this.refresh();
        }
        return adjusted;
      }
      const saved = await saveWorkspaceSetupAnswersAction({ setupId: setup.id, answers, followUpAnswers: [] });
      if (!saved.ok) return saved;
      if (!this.isLastScreen) {
        runInAction(() => {
          this.screenIndex += 1;
        });
        return saved;
      }
      const planned = await planWorkspaceSetupAction({ setupId: setup.id });
      if (planned.ok) await this.refresh();
      return planned;
    });

  confirmFollowUps = () =>
    this.run("followUps", async () => {
      const setup = this.setup;
      if (!setup || !this.canConfirmFollowUps) return null;
      const followUpAnswers = this.pendingFollowUps.flatMap((question) => {
        const value = displayedFollowUpValue(question, setup, this.followUpDrafts);
        return value ? [{ id: question.id, value: sanitizeAnswerValue(value) }] : [];
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

  retryPhase = (phase: WorkspaceSetupPhase) =>
    this.run("retry", async () => {
      const setup = this.setup;
      if (!setup) return null;
      const retried = await retryWorkspaceSetupPhaseAction({ setupId: setup.id, phase });
      if (retried.ok) await this.refresh();
      return retried;
    });

  applyStandardSetup = () =>
    this.run("standard", async () => {
      const setup = this.setup;
      if (!setup) return null;
      return applyStandardWorkspaceSetupAction({ setupId: setup.id });
    });

  uploadSpreadsheet = (file: File) =>
    this.run("upload", async () => {
      const setup = this.setup;
      if (!setup) return null;
      const formData = new FormData();
      formData.set("setupId", setup.id);
      formData.set("file", file);
      const uploaded = await uploadWorkspaceSetupSpreadsheetAction(formData);
      if (uploaded.ok) await this.refresh();
      return uploaded;
    });

  private get appLocale() {
    return isAppLocale(this.locale) ? this.locale : undefined;
  }

  private async run(
    command: SetupCommand,
    perform: () => Promise<TypedActionResult<unknown> | null>,
  ): Promise<boolean> {
    if (this.pending) return false;
    this.pending = command;
    try {
      const result = await perform();
      if (result && !result.ok) toastZodErrorTree(serializedFailureErrorTree(result.failure));
      return result?.ok ?? false;
    } finally {
      runInAction(() => {
        this.pending = null;
      });
    }
  }
}
