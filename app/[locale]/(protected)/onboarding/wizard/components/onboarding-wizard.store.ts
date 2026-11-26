import { makeAutoObservable, runInAction, toJS } from "mobx";
import equal from "fast-deep-equal/es6";

import type { RootStore } from "@/core/stores/root.store";
import type { OnboardingWizardProgress } from "@/features/onboarding-wizard/onboarding-wizard-progress.schema";
import type { ConnectChannel } from "@/ee/messaging/connect/connect-channels";
import type { WizardFlowContext, WizardFlowKey } from "./onboarding-wizard-flow";

import {
  applyOnboardingPlaybookAction,
  completeOnboardingSetupStepAction,
  completeOnboardingWizardAction,
  saveOnboardingWizardProgressAction,
  selectOnboardingJobAction,
} from "../actions";
import {
  getOnboardingAgentStatusAction,
  recordChannelSkippedAction,
  startOnboardingChannelConnectAction,
} from "../onboarding-agent-actions";
import { toastZodErrorTree } from "@/core/utils/toast-zod-error-tree";
import { serializedFailureErrorTree } from "@/core/validation/validation.utils";
import { readOnboardingWizardProgress } from "@/features/onboarding-wizard/onboarding-wizard-progress.schema";
import { reportApplicationError } from "@/core/errors/report-application-error";
import { cloudMateSignupUrl } from "@/features/onboarding-templates/cloud-signup-url";
import { buildLocalePath } from "@/i18n/locale-registry";
import {
  DEFAULT_ONBOARDING_JOB,
  parseOnboardingJob,
  type OnboardingJob,
} from "@/features/onboarding-funnel/onboarding-job";
import { parseOnboardingPlaybook, type OnboardingPlaybook } from "@/features/onboarding-funnel/onboarding-playbook";

import { persistedWizardStep, wizardBackFloor, wizardSteps, type WizardStep } from "./onboarding-wizard-flow";

export { WIZARD_STEPS, wizardSteps } from "./onboarding-wizard-flow";
export type { WizardStep } from "./onboarding-wizard-flow";

export type WizardJobChoice = {
  selectedJob: OnboardingJob;
  suggestedJob: OnboardingJob | null;
  suggestedPlaybook?: OnboardingPlaybook | null;
};

export type WizardFlowOptions = Omit<WizardFlowContext, "setupAvailable"> & {
  emptyChosen?: boolean;
  selfHosted?: boolean;
};

export class OnboardingWizardStore {
  currentStepIndex = 0;
  minStepIndex = 0;
  isSubmitting = false;
  isInitializing = true;
  pendingSaves = 0;
  inviteTab: OnboardingWizardProgress["inviteTab"] = "link";
  flowContext: WizardFlowContext = { setupAvailable: true };
  emptyChosen = false;
  selfHosted = false;
  cloudTrialOpened = false;
  selectedJob: OnboardingJob = DEFAULT_ONBOARDING_JOB;
  goalPinned = false;
  suggestedJob: OnboardingJob | null = null;
  selectedPlaybook: OnboardingPlaybook | null = null;
  suggestedPlaybook: OnboardingPlaybook | null = null;
  agentConnected = false;
  agentStatusFailed = false;
  schemaRevision: number | null = null;
  schemaBaseline: number | null = null;
  userId: string | undefined;
  savedProgress: OnboardingWizardProgress | null = null;
  private initializationVersion = 0;
  private saveQueue: Promise<unknown> = Promise.resolve();

  constructor(public readonly rootStore: RootStore) {
    makeAutoObservable<this, "saveQueue" | "initializationVersion">(this, {
      rootStore: false,
      saveQueue: false,
      initializationVersion: false,
    });
  }

  get flowKey(): WizardFlowKey {
    return this.emptyChosen ? "empty" : this.selectedJob;
  }

  get steps(): WizardStep[] {
    return wizardSteps(this.flowContext, this.flowKey);
  }

  get currentStep(): WizardStep {
    return this.steps[this.currentStepIndex];
  }

  get isFirstStep(): boolean {
    return this.currentStepIndex <= this.minStepIndex;
  }

  get isLastStep(): boolean {
    return this.currentStepIndex >= this.steps.length - 1;
  }

  get totalSteps(): number {
    return this.steps.length;
  }

  get isSaving(): boolean {
    return this.pendingSaves > 0;
  }

  get isBusy(): boolean {
    return this.isSubmitting || this.isSaving || this.isInitializing;
  }

  get isCloudMateUpsell(): boolean {
    return this.selfHosted && this.selectedJob === "workspace";
  }

  get agentChanged(): boolean {
    return this.schemaBaseline !== null && this.schemaRevision !== null && this.schemaRevision > this.schemaBaseline;
  }

  get progress(): OnboardingWizardProgress {
    return this.progressAt(this.currentStep, this.goalPinned);
  }

  private progressAt(step: WizardStep, goalPinned: boolean): OnboardingWizardProgress {
    return {
      step: persistedWizardStep(step, goalPinned),
      inviteTab: this.inviteTab,
      ai: this.rootStore.stepAiStore.selection,
      job: step === "goal" && goalPinned ? this.selectedJob : null,
      schemaBaseline: this.schemaBaseline,
    };
  }

  initialize = (
    resumeStepIndex: number,
    userId?: string,
    progress?: OnboardingWizardProgress,
    setupAvailable = true,
    jobChoice: WizardJobChoice = { selectedJob: DEFAULT_ONBOARDING_JOB, suggestedJob: null },
    flow: WizardFlowOptions = {},
  ) => {
    const identityChanged = this.userId !== userId;
    const { emptyChosen = false, selfHosted = false, ...context } = flow;
    this.flowContext = { ...context, setupAvailable };
    this.emptyChosen = emptyChosen;
    this.selfHosted = selfHosted;
    this.selectedJob = jobChoice.selectedJob;
    this.suggestedJob = jobChoice.suggestedJob;
    this.suggestedPlaybook = jobChoice.suggestedPlaybook ?? null;
    this.selectedPlaybook = this.suggestedPlaybook;
    this.initializationVersion += 1;
    this.userId = userId;
    this.savedProgress = resumeStepIndex > 0 ? readOnboardingWizardProgress(progress) : null;
    this.goalPinned = this.savedProgress?.step === "goal";
    this.rootStore.stepAiStore.reset(identityChanged);
    this.applyProgress(this.savedProgress ?? readOnboardingWizardProgress(null));
    this.currentStepIndex = resumeStepIndex;
    this.minStepIndex = wizardBackFloor(this.steps, this.steps[resumeStepIndex]);
    this.isInitializing = false;
  };

  setSelectedJob = (value: string) => {
    const job = parseOnboardingJob(value);
    if (!job || this.isSubmitting) return;
    this.selectedJob = job;
    this.goalPinned = true;
  };

  setSelectedPlaybook = (value: string) => {
    const playbook = parseOnboardingPlaybook(value);
    if (playbook && !this.isSubmitting) this.selectedPlaybook = playbook;
  };

  applyPlaybook = async (skip = false): Promise<void> => {
    if (this.isSubmitting || this.currentStep !== "playbook") return;
    const playbook = skip ? null : this.selectedPlaybook;
    if (!skip && playbook === null) return;
    this.setIsSubmitting(true);
    try {
      const result = await applyOnboardingPlaybookAction({ playbook });
      if (!result.ok) {
        toastZodErrorTree(serializedFailureErrorTree(result.failure));
        return;
      }
      this.leaveWizard(result.data.redirectTo);
    } finally {
      this.setIsSubmitting(false);
    }
  };

  chooseJob = async (): Promise<void> => {
    if (this.isSubmitting || this.currentStep !== "goal") return;
    if (this.isCloudMateUpsell) {
      this.openCloudTrial();
      return;
    }
    this.setIsSubmitting(true);
    try {
      const result = await selectOnboardingJobAction({ job: this.selectedJob });
      if (!result.ok) {
        toastZodErrorTree(serializedFailureErrorTree(result.failure));
        return;
      }
      if (this.currentStep !== "goal") return;
      const target = this.steps[this.steps.indexOf("goal") + 1];
      if (!target) return;
      if (this.userId && !(await this.persistProgress(this.progressAt(target, this.goalPinned)))) return;
      this.moveTo(target);
    } finally {
      this.setIsSubmitting(false);
    }
  };

  startEmptyWorkspace = async (): Promise<void> => {
    if (this.isSubmitting || this.currentStep !== "goal") return;
    if (await this.chooseEmptyWorkspace()) await this.advance();
  };

  private async chooseEmptyWorkspace(): Promise<boolean> {
    this.setIsSubmitting(true);
    try {
      if (this.userId && !(await this.persistProgress(this.progressAt("invite", false)))) return false;
      const result = await completeOnboardingSetupStepAction();
      if (!result.ok) {
        toastZodErrorTree(serializedFailureErrorTree(result.failure));
        return false;
      }
      if (this.currentStep !== "goal") return false;
      runInAction(() => {
        this.emptyChosen = true;
      });
      return true;
    } finally {
      this.setIsSubmitting(false);
    }
  }

  openCloudTrial = () => {
    globalThis.open(cloudMateSignupUrl(this.rootStore.localeStore.locale), "_blank", "noopener,noreferrer");
    this.cloudTrialOpened = true;
  };

  private moveTo(step: WizardStep) {
    runInAction(() => {
      const index = this.steps.indexOf(step);
      if (index === -1) return;
      this.currentStepIndex = index;
      this.minStepIndex = Math.max(Math.min(this.minStepIndex, index), wizardBackFloor(this.steps, step));
    });
  }

  connectChannel = async (channel: ConnectChannel): Promise<void> => {
    if (this.isSubmitting || this.currentStep !== "channel") return;
    this.setIsSubmitting(true);
    try {
      if (this.userId && !(await this.persistProgress(this.progressAt("channel", this.goalPinned)))) return;
      const result = await startOnboardingChannelConnectAction(channel);
      if (result.ok) {
        globalThis.location.assign(result.data.url);
        return;
      }
      toastZodErrorTree(result.error);
    } finally {
      this.setIsSubmitting(false);
    }
  };

  leaveChannelStep = async (skipped: boolean): Promise<void> => {
    if (this.isSubmitting || this.currentStep !== "channel") return;
    if (skipped) await recordChannelSkippedAction().catch(reportApplicationError);
    if (this.currentStep !== "channel") return;
    await this.advance();
  };

  continueFromConnect = async (): Promise<void> => {
    if (this.isSubmitting || this.currentStep !== "ai") return;
    runInAction(() => {
      this.schemaBaseline = null;
    });
    await this.next();
    if (this.steps[this.currentStepIndex] === "handoff") void this.refreshAgentStatus().catch(reportApplicationError);
  };

  refreshAgentStatus = async (): Promise<void> => {
    const result = await getOnboardingAgentStatusAction();
    runInAction(() => {
      if (!result.ok) {
        this.agentStatusFailed = true;
        return;
      }
      this.agentStatusFailed = false;
      this.agentConnected = this.agentConnected || result.data.connected;
      this.schemaRevision = result.data.schemaRevision;
      if (this.currentStep === "handoff" && this.schemaBaseline === null)
        this.schemaBaseline = result.data.schemaRevision;
    });
  };

  setInviteTab = (tab: string) => {
    if (this.isSaving || (tab !== "link" && tab !== "email")) return;
    this.inviteTab = tab;
  };

  persistProgress = (progress: OnboardingWizardProgress = this.progress): Promise<boolean> => {
    const userId = this.userId;
    if (!userId) return Promise.resolve(true);
    const version = this.initializationVersion;
    const snapshot = toJS(progress);
    this.pendingSaves += 1;
    const save = async () => {
      if (version !== this.initializationVersion) return false;
      if (equal(snapshot, this.savedProgress)) return true;
      try {
        const result = await saveOnboardingWizardProgressAction({
          userId,
          progress: snapshot,
        });
        if (version !== this.initializationVersion) return false;
        if (!result.ok) {
          toastZodErrorTree(serializedFailureErrorTree(result.failure));
          const saved = this.savedProgress;
          if (saved) runInAction(() => this.applyProgress(saved));
          return false;
        }
        const kept = new Set(Object.values(result.data.ai.apiKeyIds));
        runInAction(() => {
          this.savedProgress = result.data;
          this.rootStore.stepAiStore.forgetApiKeyIds(
            Object.values(snapshot.ai.apiKeyIds).filter((id) => id !== undefined && !kept.has(id)),
          );
        });
        return true;
      } catch (error) {
        const saved = this.savedProgress;
        if (version === this.initializationVersion && saved) runInAction(() => this.applyProgress(saved));
        reportApplicationError(error);
        return false;
      }
    };
    const pending = this.saveQueue.then(save, save);
    this.saveQueue = pending;
    return pending.finally(() =>
      runInAction(() => {
        this.pendingSaves -= 1;
      }),
    );
  };

  private applyProgress(progress: OnboardingWizardProgress) {
    this.inviteTab = progress.inviteTab;
    this.rootStore.stepAiStore.restoreSelection(progress.ai);
    this.schemaBaseline = progress.schemaBaseline;
  }

  next = async () => {
    if (this.isSaving || this.isLastStep) return;
    const version = this.initializationVersion;
    const step = this.steps[this.currentStepIndex + 1];
    if (this.userId && !(await this.persistProgress(this.progressAt(step, this.goalPinned)))) return;
    if (version !== this.initializationVersion) return;
    this.moveTo(step);
  };

  advance = async (): Promise<void> => {
    if (this.isLastStep) await this.complete();
    else await this.next();
  };

  back = async () => {
    if (this.isSaving || this.currentStepIndex <= this.minStepIndex) return;
    const version = this.initializationVersion;
    const target = this.steps[this.currentStepIndex - 1];
    if (this.userId && !(await this.persistProgress(this.progressAt(target, true)))) return;
    if (version !== this.initializationVersion) return;
    runInAction(() => {
      if (this.currentStepIndex <= this.minStepIndex) return;
      this.currentStepIndex -= 1;
      if (target === "goal") this.goalPinned = true;
    });
  };

  completeSetupStep = async (): Promise<void> => {
    if (this.isSubmitting || this.currentStep !== "setup") return;
    this.setIsSubmitting(true);
    let completed = false;
    try {
      const result = await completeOnboardingSetupStepAction();
      if (result.ok) completed = true;
      else toastZodErrorTree(serializedFailureErrorTree(result.failure));
    } finally {
      this.setIsSubmitting(false);
    }
    if (completed && this.currentStep === "setup") await this.advance();
  };

  complete = async (): Promise<void> => {
    if (this.isSubmitting) return;
    this.setIsSubmitting(true);
    try {
      if (this.userId && !(await this.persistProgress())) return;
      const res = await completeOnboardingWizardAction();
      if (!res.ok) {
        toastZodErrorTree(serializedFailureErrorTree(res.failure));
        return;
      }

      this.leaveWizard(res.data.redirectTo);
    } finally {
      this.setIsSubmitting(false);
    }
  };

  private leaveWizard(redirectTo: string) {
    globalThis.location.assign(buildLocalePath(this.rootStore.localeStore.locale, redirectTo));
  }

  setIsSubmitting = (isSubmitting: boolean) => {
    this.isSubmitting = isSubmitting;
  };
}
