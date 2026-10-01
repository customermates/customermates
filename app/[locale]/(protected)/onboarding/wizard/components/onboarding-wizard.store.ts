import { makeAutoObservable, runInAction, toJS } from "mobx";
import equal from "fast-deep-equal/es6";

import type { RootStore } from "@/core/stores/root.store";
import type { OnboardingWizardProgress } from "@/features/onboarding-wizard/onboarding-wizard-progress.schema";

import { completeOnboardingWizardAction, saveOnboardingWizardProgressAction } from "../actions";
import { toastZodErrorTree } from "@/core/utils/toast-zod-error-tree";
import { readOnboardingWizardProgress } from "@/features/onboarding-wizard/onboarding-wizard-progress.schema";
import { reportApplicationError } from "@/core/errors/report-application-error";

export const WIZARD_STEPS = ["profile", "invite", "ai"] as const;
type WizardStep = (typeof WIZARD_STEPS)[number];

export class OnboardingWizardStore {
  currentStepIndex = 0;
  minStepIndex = 0;
  isSubmitting = false;
  isInitializing = true;
  pendingSaves = 0;
  inviteTab: OnboardingWizardProgress["inviteTab"] = "link";
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

  get currentStep(): WizardStep {
    return WIZARD_STEPS[this.currentStepIndex];
  }

  get isFirstStep(): boolean {
    return this.currentStepIndex <= this.minStepIndex;
  }

  get totalSteps(): number {
    return WIZARD_STEPS.length;
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

  initialize = (profileCompleted: boolean, userId?: string, progress?: OnboardingWizardProgress) => {
    const identityChanged = this.userId !== userId;
    this.initializationVersion += 1;
    this.userId = userId;
    this.savedProgress = profileCompleted ? readOnboardingWizardProgress(progress) : null;
    this.rootStore.stepAiStore.reset(identityChanged);
    this.applyProgress(this.savedProgress ?? readOnboardingWizardProgress(null));
    this.minStepIndex = profileCompleted ? 1 : 0;
    if (!profileCompleted) this.currentStepIndex = 0;
    this.isInitializing = false;
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
          toastZodErrorTree(result.error);
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
    this.currentStepIndex = WIZARD_STEPS.indexOf(progress.step);
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
    if (this.isSaving || this.currentStepIndex >= WIZARD_STEPS.length - 1) return;
    const version = this.initializationVersion;
    if (this.userId && !(await this.persistProgress({ ...this.progress, step: "ai" }))) return;
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

  complete = async (): Promise<void> => {
    this.setIsSubmitting(true);
    try {
      if (this.userId && !(await this.persistProgress())) return;
      const res = await completeOnboardingWizardAction();
      if (!res.ok) {
        toastZodErrorTree(res.error);
        return;
      }

      this.leaveWizard(res.data.redirectTo);
    } finally {
      this.setIsSubmitting(false);
    }
  };

  private leaveWizard(redirectTo: string) {
    globalThis.location.assign(redirectTo);
  }

  setIsSubmitting = (isSubmitting: boolean) => {
    this.isSubmitting = isSubmitting;
  };
}
