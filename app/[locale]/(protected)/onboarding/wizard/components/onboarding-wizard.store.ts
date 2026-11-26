import { makeAutoObservable, runInAction, toJS } from "mobx";
import equal from "fast-deep-equal/es6";

import type { RootStore } from "@/core/stores/root.store";
import type { OnboardingWizardProgress } from "@/features/onboarding-wizard/onboarding-wizard-progress.schema";
import type { ConnectChannel } from "@/ee/messaging/connect/connect-channels";
import type { WizardFlowContext, WizardFlowKey, WizardJob } from "./onboarding-wizard-flow";

import {
  applyOnboardingPlaybookAction,
  completeOnboardingSetupStepAction,
  completeOnboardingWizardAction,
  saveOnboardingWizardProgressAction,
  selectOnboardingJobAction,
} from "../actions";
import { recordChannelSkippedAction, startOnboardingChannelConnectAction } from "../onboarding-channel-actions";
import { toastZodErrorTree } from "@/core/utils/toast-zod-error-tree";
import { serializedFailureErrorTree } from "@/core/validation/validation.utils";
import { readOnboardingWizardProgress } from "@/features/onboarding-wizard/onboarding-wizard-progress.schema";
import { reportApplicationError } from "@/core/errors/report-application-error";
import { buildLocalePath } from "@/i18n/locale-registry";
import { parseOnboardingPlaybook, type OnboardingPlaybook } from "@/features/onboarding-funnel/onboarding-playbook";

import { persistedWizardStep, wizardBackFloor, wizardSteps, type WizardStep } from "./onboarding-wizard-flow";

export { WIZARD_STEPS, wizardSteps } from "./onboarding-wizard-flow";
export type { WizardStep } from "./onboarding-wizard-flow";

export type WizardJobChoice = {
  job: WizardJob;
  jobRecorded: boolean;
  suggestedPlaybook?: OnboardingPlaybook | null;
};

export type WizardFlowOptions = Omit<WizardFlowContext, "setupAvailable"> & { emptyChosen?: boolean };

export class OnboardingWizardStore {
  currentStepIndex = 0;
  minStepIndex = 0;
  isSubmitting = false;
  isInitializing = true;
  pendingSaves = 0;
  inviteTab: OnboardingWizardProgress["inviteTab"] = "link";
  flowContext: WizardFlowContext = { setupAvailable: true };
  emptyChosen = false;
  job: WizardJob = "workspace";
  jobRecorded = true;
  selectedPlaybook: OnboardingPlaybook | null = null;
  suggestedPlaybook: OnboardingPlaybook | null = null;
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
    return this.emptyChosen ? "empty" : this.job;
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
    return this.steps[this.currentStepIndex + 1] === "finish" || this.currentStepIndex >= this.steps.length - 1;
  }

  get isSaving(): boolean {
    return this.pendingSaves > 0;
  }

  get isBusy(): boolean {
    return this.isSubmitting || this.isSaving || this.isInitializing;
  }

  get progress(): OnboardingWizardProgress {
    return this.progressAt(this.currentStep);
  }

  private progressAt(step: WizardStep): OnboardingWizardProgress {
    return { step: persistedWizardStep(step), inviteTab: this.inviteTab };
  }

  initialize = (
    resumeStepIndex: number,
    userId?: string,
    progress?: OnboardingWizardProgress,
    setupAvailable = true,
    jobChoice: WizardJobChoice = { job: "workspace", jobRecorded: true },
    flow: WizardFlowOptions = {},
  ) => {
    const { emptyChosen = false, ...context } = flow;
    this.flowContext = { ...context, setupAvailable };
    this.emptyChosen = emptyChosen;
    this.job = jobChoice.job;
    this.jobRecorded = jobChoice.jobRecorded;
    this.suggestedPlaybook = jobChoice.suggestedPlaybook ?? null;
    this.selectedPlaybook = this.suggestedPlaybook;
    this.initializationVersion += 1;
    this.userId = userId;
    this.savedProgress = resumeStepIndex > 0 ? readOnboardingWizardProgress(progress) : null;
    this.applyProgress(this.savedProgress ?? readOnboardingWizardProgress(null));
    this.currentStepIndex = resumeStepIndex;
    this.minStepIndex = wizardBackFloor(this.steps, this.steps[resumeStepIndex]);
    this.isInitializing = false;
  };

  recordJob = async (): Promise<void> => {
    if (this.jobRecorded || !this.userId) return;
    this.jobRecorded = true;
    const result = await selectOnboardingJobAction({ job: this.job });
    if (!result.ok) runInAction(() => (this.jobRecorded = false));
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

  startEmptyWorkspace = async (): Promise<void> => {
    if (this.isSubmitting || this.currentStep !== "setup") return;
    if (await this.finishSetupStep()) {
      runInAction(() => {
        this.emptyChosen = true;
        this.currentStepIndex = 0;
      });
      await this.next();
    }
  };

  completeSetupStep = async (): Promise<void> => {
    if (this.isSubmitting || this.currentStep !== "setup") return;
    if ((await this.finishSetupStep()) && this.currentStep === "setup") await this.next();
  };

  private async finishSetupStep(): Promise<boolean> {
    this.setIsSubmitting(true);
    try {
      const result = await completeOnboardingSetupStepAction();
      if (!result.ok) toastZodErrorTree(serializedFailureErrorTree(result.failure));
      return result.ok;
    } finally {
      this.setIsSubmitting(false);
    }
  }

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
      if (this.userId && !(await this.persistProgress(this.progressAt("channel")))) return;
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
    await this.next();
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
        const result = await saveOnboardingWizardProgressAction({ userId, progress: snapshot });
        if (version !== this.initializationVersion) return false;
        if (!result.ok) {
          toastZodErrorTree(serializedFailureErrorTree(result.failure));
          const saved = this.savedProgress;
          if (saved) runInAction(() => this.applyProgress(saved));
          return false;
        }
        runInAction(() => {
          this.savedProgress = result.data;
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
  }

  next = async () => {
    if (this.isSaving || this.currentStepIndex >= this.steps.length - 1) return;
    const version = this.initializationVersion;
    const step = this.steps[this.currentStepIndex + 1];
    if (this.userId && step !== "finish" && !(await this.persistProgress(this.progressAt(step)))) return;
    if (version !== this.initializationVersion) return;
    this.moveTo(step);
  };

  back = async () => {
    if (this.isSaving || this.currentStepIndex <= this.minStepIndex) return;
    const version = this.initializationVersion;
    const target = this.steps[this.currentStepIndex - 1];
    if (this.userId && !(await this.persistProgress(this.progressAt(target)))) return;
    if (version !== this.initializationVersion) return;
    runInAction(() => {
      if (this.currentStepIndex > this.minStepIndex) this.currentStepIndex -= 1;
    });
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
