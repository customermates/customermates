import { makeAutoObservable } from "mobx";

import type { RootStore } from "@/core/stores/root.store";

import { completeOnboardingWizardAction } from "../actions";
import { toastZodErrorTree } from "@/core/utils/toast-zod-error-tree";

export const WIZARD_STEPS = ["profile", "invite", "ai"] as const;
type WizardStep = (typeof WIZARD_STEPS)[number];

export class OnboardingWizardStore {
  currentStepIndex = 0;
  minStepIndex = 0;
  isSubmitting = false;

  constructor(public readonly rootStore: RootStore) {
    makeAutoObservable(this, { rootStore: false });
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

  setInitialStep = (index: number) => {
    this.minStepIndex = index;
    this.currentStepIndex = index;
  };

  setMinStepIndex = (index: number) => {
    this.minStepIndex = index;
  };

  next = () => {
    if (this.currentStepIndex >= WIZARD_STEPS.length - 1) return;

    this.currentStepIndex += 1;
  };

  back = () => {
    if (this.currentStepIndex > this.minStepIndex) this.currentStepIndex -= 1;
  };

  complete = async (): Promise<void> => {
    this.setIsSubmitting(true);
    try {
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
