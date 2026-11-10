import { makeAutoObservable, runInAction, toJS } from "mobx";
import equal from "fast-deep-equal/es6";

import type { RootStore } from "@/core/stores/root.store";
import type { OnboardingWizardProgress } from "@/features/onboarding-wizard/onboarding-wizard-progress.schema";

import {
  applyOnboardingPlaybookAction,
  completeOnboardingSetupStepAction,
  completeOnboardingWizardAction,
  saveOnboardingWizardProgressAction,
  selectOnboardingJobAction,
} from "../actions";
import { toastZodErrorTree } from "@/core/utils/toast-zod-error-tree";
import { serializedFailureErrorTree } from "@/core/validation/validation.utils";
import { readOnboardingWizardProgress } from "@/features/onboarding-wizard/onboarding-wizard-progress.schema";
import { reportApplicationError } from "@/core/errors/report-application-error";
import { buildLocalePath } from "@/i18n/locale-registry";
import {
  DEFAULT_ONBOARDING_JOB,
  parseOnboardingJob,
  type OnboardingJob,
} from "@/features/onboarding-funnel/onboarding-job";
import { parseOnboardingPlaybook, type OnboardingPlaybook } from "@/features/onboarding-funnel/onboarding-playbook";

export const WIZARD_STEPS = ["profile", "goal", "playbook", "setup", "invite", "ai"] as const;
export type WizardStep = (typeof WIZARD_STEPS)[number];

const FOLLOWUP_STEPS: readonly WizardStep[] = ["profile", "goal", "playbook"];
const SETUP_STEPS: readonly WizardStep[] = ["profile", "goal", "setup", "invite", "ai"];
const PLAIN_STEPS: readonly WizardStep[] = ["profile", "invite", "ai"];
const AGENT_STEPS: readonly WizardStep[] = ["profile", "goal", "ai"];

export function wizardSteps(setupAvailable: boolean, job: OnboardingJob = DEFAULT_ONBOARDING_JOB): WizardStep[] {
  if (!setupAvailable) return [...PLAIN_STEPS];
  if (job === "followup") return [...FOLLOWUP_STEPS];
  return job === "agent" ? [...AGENT_STEPS] : [...SETUP_STEPS];
}

export type WizardJobChoice = {
  selectedJob: OnboardingJob;
  suggestedJob: OnboardingJob | null;
  suggestedPlaybook?: OnboardingPlaybook | null;
};

export class OnboardingWizardStore {
  currentStepIndex = 0;
  minStepIndex = 0;
  isSubmitting = false;
  isInitializing = true;
  pendingSaves = 0;
  inviteTab: OnboardingWizardProgress["inviteTab"] = "link";
  setupAvailable = true;
  selectedJob: OnboardingJob = DEFAULT_ONBOARDING_JOB;
  suggestedJob: OnboardingJob | null = null;
  selectedPlaybook: OnboardingPlaybook | null = null;
  suggestedPlaybook: OnboardingPlaybook | null = null;
  userId: string | undefined;
  savedProgress: OnboardingWizardProgress | null = null;
  private initializationVersion = 0;
  private saveQueue: Promise<unknown> = Promise.resolve();

  constructor(public readonly rootStore: RootStore) {
    makeAutoObservable<this, "saveQueue">(this, {
      rootStore: false,
      saveQueue: false,
    });
  }

  get steps(): WizardStep[] {
    return wizardSteps(this.setupAvailable, this.selectedJob);
  }

  get currentStep(): WizardStep {
    return this.steps[this.currentStepIndex];
  }

  get isFirstStep(): boolean {
    return this.currentStepIndex <= this.minStepIndex;
  }

  get totalSteps(): number {
    return this.steps.length;
  }

  get isSaving(): boolean {
    return this.pendingSaves > 0;
  }

  get progress(): OnboardingWizardProgress {
    return {
      step: this.currentStep === "ai" ? "ai" : "invite",
      inviteTab: this.inviteTab,
      ai: this.rootStore.stepAiStore.selection,
    };
  }

  initialize = (
    resumeStepIndex: number,
    userId?: string,
    progress?: OnboardingWizardProgress,
    setupAvailable = true,
    jobChoice: WizardJobChoice = { selectedJob: DEFAULT_ONBOARDING_JOB, suggestedJob: null },
  ) => {
    const identityChanged = this.userId !== userId;
    this.setupAvailable = setupAvailable;
    this.selectedJob = jobChoice.selectedJob;
    this.suggestedJob = jobChoice.suggestedJob;
    this.suggestedPlaybook = jobChoice.suggestedPlaybook ?? null;
    this.selectedPlaybook = this.suggestedPlaybook;
    const resumesSavedStep = this.steps[resumeStepIndex] === "invite";
    this.initializationVersion += 1;
    this.userId = userId;
    this.savedProgress = resumeStepIndex > 0 ? readOnboardingWizardProgress(progress) : null;
    this.rootStore.stepAiStore.reset(identityChanged);
    this.applyProgress(this.savedProgress ?? readOnboardingWizardProgress(null));
    this.minStepIndex = resumeStepIndex;
    this.currentStepIndex = resumesSavedStep
      ? this.steps.indexOf(this.savedProgress?.step ?? "invite")
      : resumeStepIndex;
    this.isInitializing = false;
  };

  setSelectedJob = (value: string) => {
    const job = parseOnboardingJob(value);
    if (job && !this.isSubmitting) this.selectedJob = job;
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
    this.setIsSubmitting(true);
    try {
      const result = await selectOnboardingJobAction({ job: this.selectedJob });
      if (!result.ok) {
        toastZodErrorTree(serializedFailureErrorTree(result.failure));
        return;
      }
      if (this.currentStep !== "goal") return;
      const outcome = result.data;
      if (outcome.next === "playbook") {
        runInAction(() => {
          this.currentStepIndex = this.steps.indexOf("playbook");
          this.minStepIndex = this.currentStepIndex;
        });
        return;
      }
      if (outcome.next === "ai") {
        if (this.userId && !(await this.persistProgress({ ...this.progress, step: "ai" }))) return;
        runInAction(() => {
          this.currentStepIndex = this.steps.indexOf("ai");
          this.minStepIndex = this.currentStepIndex;
        });
        return;
      }
      runInAction(() => {
        this.currentStepIndex = this.steps.indexOf("setup");
        this.minStepIndex = this.currentStepIndex;
      });
    } finally {
      this.setIsSubmitting(false);
    }
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
  }

  setInitialStep = (index: number) => {
    this.minStepIndex = index;
    this.currentStepIndex = index;
  };

  setMinStepIndex = (index: number) => {
    this.minStepIndex = index;
  };

  next = async () => {
    if (this.isSaving || this.currentStepIndex >= this.steps.length - 1) return;
    const version = this.initializationVersion;
    const step = this.steps[this.currentStepIndex + 1] === "ai" ? "ai" : "invite";
    if (this.userId && !(await this.persistProgress({ ...this.progress, step }))) return;
    if (version !== this.initializationVersion) return;
    runInAction(() => {
      this.currentStepIndex += 1;
    });
  };

  back = async () => {
    if (this.isSaving) return;
    const version = this.initializationVersion;
    if (this.userId && !(await this.persistProgress({ ...this.progress, step: "invite" }))) return;
    if (version !== this.initializationVersion) return;
    runInAction(() => {
      if (this.currentStepIndex > this.minStepIndex) this.currentStepIndex -= 1;
    });
  };

  completeSetupStep = async (): Promise<void> => {
    if (this.isSubmitting) return;
    this.setIsSubmitting(true);
    try {
      const result = await completeOnboardingSetupStepAction();
      if (!result.ok) {
        toastZodErrorTree(serializedFailureErrorTree(result.failure));
        return;
      }
      if (this.currentStep !== "setup") return;
      await this.next();
      runInAction(() => {
        if (this.currentStep !== "setup") this.minStepIndex = this.currentStepIndex;
      });
    } finally {
      this.setIsSubmitting(false);
    }
  };

  complete = async (): Promise<void> => {
    this.setIsSubmitting(true);
    try {
      if (this.userId && !(await this.persistProgress())) return;
      const { selectedTool, canFinish } = this.rootStore.stepAiStore;
      if (selectedTool !== null && !canFinish) return;
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
