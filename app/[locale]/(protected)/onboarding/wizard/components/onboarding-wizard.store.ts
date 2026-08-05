import { makeAutoObservable } from "mobx";
import type { EntityType } from "@/generated/prisma";

import type { RootStore } from "@/core/stores/root.store";
import type {
  EntityTerminologyOverride,
  TerminologySelectionMap,
} from "@/features/entity-terminology/entity-terminology.types";

import { completeOnboardingWizardAction } from "../actions";
import { updateCompanyAction } from "@/app/[locale]/(protected)/company/actions";
import { toastZodErrorTree } from "@/core/utils/toast-zod-error-tree";
import {
  defaultTerminologySelections,
  isTerminologyPresetKey,
  terminologySelectionsFromOverrides,
  terminologySelectionsToEntries,
} from "@/features/entity-terminology/entity-terminology.constants";

export const WIZARD_STEPS = ["profile", "terminology", "invite", "ai"] as const;
type WizardStep = (typeof WIZARD_STEPS)[number];

type BeforeNextHandler = () => Promise<boolean> | boolean;

export class OnboardingWizardStore {
  currentStepIndex = 0;
  minStepIndex = 0;
  isSubmitting = false;
  terminology: TerminologySelectionMap = defaultTerminologySelections();
  private beforeNext: BeforeNextHandler | null = null;

  constructor(public readonly rootStore: RootStore) {
    makeAutoObservable<this, "beforeNext">(this, { rootStore: false, beforeNext: false });
  }

  initTerminology = (overrides: EntityTerminologyOverride[]) => {
    this.terminology = terminologySelectionsFromOverrides(overrides);
  };

  setTerminologyPreset = (entityType: EntityType, presetKey: string) => {
    if (!isTerminologyPresetKey(entityType, presetKey)) return;

    this.terminology = { ...this.terminology, [entityType]: presetKey };
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

  persistTerminology = async (): Promise<boolean> => {
    const result = await updateCompanyAction({ terminology: terminologySelectionsToEntries(this.terminology) });
    if (!result.ok) {
      toastZodErrorTree(result.error);
      return false;
    }

    await this.rootStore.terminologyStore.refresh();
    this.setMinStepIndex(this.currentStepIndex + 1);
    return true;
  };

  complete = async (): Promise<void> => {
    this.setIsSubmitting(true);
    try {
      const res = await completeOnboardingWizardAction();
      if (!res.ok) toastZodErrorTree(res.error);
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
