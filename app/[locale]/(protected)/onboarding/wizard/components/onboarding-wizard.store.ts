import { makeAutoObservable } from "mobx";
import { SalesType } from "@/generated/prisma";

import type { RootStore } from "@/core/stores/root.store";

import { completeOnboardingWizardAction, seedOnboardingDataAction } from "../actions";

export const WIZARD_STEPS = ["profile", "company", "entities", "demoData", "invite", "ai"] as const;
type WizardStep = (typeof WIZARD_STEPS)[number];

type BeforeNextHandler = () => Promise<boolean> | boolean;

export class OnboardingWizardStore {
  currentStepIndex = 0;
  minStepIndex = 0;
  isSubmitting = false;
  salesType: SalesType = SalesType.service;
  keepDemoData = true;
  private beforeNext: BeforeNextHandler | null = null;

  constructor(public readonly rootStore: RootStore) {
    makeAutoObservable<this, "beforeNext">(this, { rootStore: false, beforeNext: false });
  }

  setSalesType = (salesType: SalesType) => {
    this.salesType = salesType;
  };

  setKeepDemoData = (keepDemoData: boolean) => {
    this.keepDemoData = keepDemoData;
  };

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
    if (this.currentStepIndex < index) this.currentStepIndex = index;
  };

  setMinStepIndex = (index: number) => {
    this.minStepIndex = index;
  };

  next = async () => {
    if (this.currentStepIndex >= WIZARD_STEPS.length - 1) return;
    if (this.beforeNext) {
      this.setIsSubmitting(true);
      try {
        const ok = await this.beforeNext();
        if (!ok) return;
      } finally {
        this.setIsSubmitting(false);
      }
    }
    this.currentStepIndex += 1;
  };

  back = () => {
    if (this.currentStepIndex > this.minStepIndex) this.currentStepIndex -= 1;
  };

  seedDemoData = async (): Promise<boolean> => {
    const result = await seedOnboardingDataAction({
      salesType: this.salesType,
      keepDemoData: this.keepDemoData,
    });
    if (!result.ok) return false;
    this.setMinStepIndex(this.currentStepIndex + 1);
    return true;
  };

  complete = async (): Promise<void> => {
    this.setIsSubmitting(true);
    try {
      await completeOnboardingWizardAction();
    } finally {
      this.setIsSubmitting(false);
    }
  };

  setIsSubmitting = (isSubmitting: boolean) => {
    this.isSubmitting = isSubmitting;
  };

  setBeforeNext = (handler: BeforeNextHandler | null) => {
    this.beforeNext = handler;
  };
}
