import type { RootStore } from "@/core/stores/root.store";
import type { SerializedInteractorFailure } from "@/core/validation/validation.utils";
import type { SetupAnswerValue, SetupAnswers } from "@/features/workspace-setup/setup-answers.schema";
import type { WorkspaceSetupStatusView, WorkspaceSetupView } from "@/ee/workspace-setup/workspace-setup-status";
import type { WorkspaceSetupPhase } from "@/ee/workspace-setup/workspace-setup.schema";
import type { SpreadsheetReadFailureCode } from "@/features/data-transfer/spreadsheet/spreadsheet.schema";
import type { SetupStage } from "./setup-interview-state";

import { makeAutoObservable, observable, runInAction, toJS } from "mobx";

import { SPREADSHEET_MAX_FILE_BYTES } from "@/features/data-transfer/spreadsheet/spreadsheet.schema";
import { SETUP_SCREENS } from "@/features/workspace-setup/setup-interview";
import { touchAnswer } from "@/features/workspace-setup/setup-prefill";
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
  setWorkspaceSetupWebsiteAction,
  startWorkspaceSetupAction,
  uploadWorkspaceSetupSpreadsheetAction,
} from "../../workspace-setup-actions";

import {
  adjacentScreenIndex,
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
  visibleScreenIndexes,
} from "./setup-interview-state";

type SetupCommand = "start" | "website" | "save" | "plan" | "followUps" | "build" | "retry" | "upload";

type SpreadsheetRejection = { fileName: string; failure: SpreadsheetReadFailureCode };

const POLLED_GENERATION = new Set(["queued", "running"]);
const PENDING_PREFILL = new Set(["idle", "queued", "running"]);
const ADJUSTABLE_STAGES = new Set<SetupStage>(["plan", "planFailed"]);
const FINDING_CRAWL = new Set(["queued", "discovering"]);

type WebsiteReading = {
  stage: "finding" | "reading" | "suggesting";
  progress: number;
  read: number;
  total: number;
};

export class WorkspaceSetupStore {
  view: WorkspaceSetupStatusView | null = null;
  answers: SetupAnswers = {};
  touched = observable.set<string>();
  followUpDrafts: Record<string, SetupAnswerValue> = {};
  screenIndex = 0;
  furthestScreen = 0;
  adjusting = false;
  spreadsheetRejection: SpreadsheetRejection | null = null;
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

  get screen() {
    return SETUP_SCREENS[this.screenIndex];
  }

  get isLastScreen(): boolean {
    return adjacentScreenIndex(this.screenIndex, this.answers, 1) === null;
  }

  get visibleScreens(): number[] {
    return visibleScreenIndexes(this.answers);
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
    return this.prefillRunning || POLLED_GENERATION.has(setup.plan.status);
  }

  get prefillRunning(): boolean {
    const setup = this.setup;
    return Boolean(setup?.websiteUrl) && PENDING_PREFILL.has(setup?.interview.prefill ?? "skipped");
  }

  get websiteReading(): WebsiteReading | null {
    const setup = this.setup;
    if (!setup || !this.prefillRunning) return null;
    const { crawlStatus, sourcesFound, sourcesRead } = setup.knowledgeBase;
    if (crawlStatus === null || FINDING_CRAWL.has(crawlStatus) || (crawlStatus === "fetching" && sourcesFound === 0))
      return { stage: "finding", progress: 5, read: 0, total: 0 };
    if (crawlStatus === "fetching") {
      const read = Math.min(sourcesRead, sourcesFound);
      return { stage: "reading", progress: 10 + Math.round((70 * read) / sourcesFound), read, total: sourcesFound };
    }
    return { stage: "suggesting", progress: 85, read: sourcesRead, total: sourcesFound };
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
      this.adjusting = false;
      this.spreadsheetRejection = null;
      this.screenIndex = resumeScreenIndex(this.answers, setup?.interview.confirmedScreens ?? 0);
      this.furthestScreen = this.screenIndex;
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
    const previous = adjacentScreenIndex(this.screenIndex, this.answers, -1);
    if (previous === null) {
      if (this.adjusting) this.discardAdjustment();
      return;
    }
    this.screenIndex = previous;
  };

  adjust = () => {
    if (this.isBusy) return;
    this.adjusting = true;
    this.screenIndex = 0;
    this.furthestScreen = this.visibleScreens.at(-1) ?? 0;
  };

  goToScreen = (index: number) => {
    if (this.isBusy || index > this.furthestScreen || !this.visibleScreens.includes(index)) return;
    this.screenIndex = index;
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

  setWebsite = (websiteUrl: string) =>
    this.run("website", async () => {
      const setup = this.setup;
      if (!setup) return null;
      const result = await setWorkspaceSetupWebsiteAction({ setupId: setup.id, websiteUrl, locale: this.appLocale });
      if (result.ok) await this.refresh();
      return result;
    });

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
      const saved = await saveWorkspaceSetupAnswersAction({
        setupId: setup.id,
        answers,
        followUpAnswers: [],
        confirmedScreen: this.screenIndex,
      });
      if (!saved.ok) return saved;
      if (!this.isLastScreen) {
        runInAction(() => this.advanceScreen());
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
    this.advanceScreen();
    return true;
  }

  private advanceScreen() {
    this.screenIndex = adjacentScreenIndex(this.screenIndex, this.answers, 1) ?? this.screenIndex;
    this.furthestScreen = Math.max(this.furthestScreen, this.screenIndex);
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
