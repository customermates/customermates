import { makeAutoObservable, runInAction, toJS } from "mobx";
import equal from "fast-deep-equal/es6";

import type { RootStore } from "@/core/stores/root.store";
import type { OnboardingWizardProgress } from "@/features/onboarding-wizard/onboarding-wizard-progress.schema";
import type { TemplateSlug } from "@/core/templates/template-slugs";
import type { WizardFlowContext, WizardFlowKey } from "./onboarding-wizard-flow";

import {
  applyOnboardingPlaybookAction,
  completeOnboardingSetupStepAction,
  completeOnboardingWizardAction,
  recordDiscoveryAnswerAction,
  saveOnboardingWizardProgressAction,
  selectOnboardingJobAction,
} from "../actions";
import { getOnboardingAgentStatusAction, getOnboardingTemplatePromptAction } from "../onboarding-agent-actions";
import { toastZodErrorTree } from "@/core/utils/toast-zod-error-tree";
import { serializedFailureErrorTree } from "@/core/validation/validation.utils";
import { readOnboardingWizardProgress } from "@/features/onboarding-wizard/onboarding-wizard-progress.schema";
import { reportApplicationError } from "@/core/errors/report-application-error";
import { isTemplateSlug } from "@/core/templates/template-slugs";
import {
  DISCOVERY_DETAIL_MAX_LENGTH,
  parseDiscoveryChoice,
  type DiscoveryChoice,
} from "@/features/onboarding-funnel/discovery-answer";
import { cloudMateSignupUrl } from "@/features/onboarding-templates/cloud-signup-url";
import { buildLocalePath } from "@/i18n/locale-registry";
import {
  DEFAULT_ONBOARDING_JOB,
  parseOnboardingJob,
  type OnboardingJob,
} from "@/features/onboarding-funnel/onboarding-job";
import { parseOnboardingPlaybook, type OnboardingPlaybook } from "@/features/onboarding-funnel/onboarding-playbook";

import {
  connectsAgentWithVerification,
  persistedWizardStep,
  wizardSteps,
  type WizardStep,
} from "./onboarding-wizard-flow";

export { WIZARD_STEPS, wizardSteps } from "./onboarding-wizard-flow";
export type { WizardStep } from "./onboarding-wizard-flow";

export type WizardJobChoice = {
  selectedJob: OnboardingJob;
  suggestedJob: OnboardingJob | null;
  suggestedPlaybook?: OnboardingPlaybook | null;
};

export type WizardFlowOptions = {
  chooseAvailable?: boolean;
  templatesAvailable?: boolean;
  sourceAvailable?: boolean;
  emptyChosen?: boolean;
  selfHosted?: boolean;
  template?: TemplateSlug | null;
};

export type PromptState = "idle" | "loading" | "ready" | "failed";

export class OnboardingWizardStore {
  currentStepIndex = 0;
  minStepIndex = 0;
  isSubmitting = false;
  isInitializing = true;
  pendingSaves = 0;
  inviteTab: OnboardingWizardProgress["inviteTab"] = "link";
  setupAvailable = true;
  chooseAvailable = false;
  templatesAvailable = false;
  sourceAvailable = false;
  selectedDiscovery: DiscoveryChoice | null = null;
  discoveryDetail = "";
  emptyChosen = false;
  selfHosted = false;
  cloudTrialOpened = false;
  selectedJob: OnboardingJob = DEFAULT_ONBOARDING_JOB;
  goalPinned = false;
  suggestedJob: OnboardingJob | null = null;
  selectedPlaybook: OnboardingPlaybook | null = null;
  suggestedPlaybook: OnboardingPlaybook | null = null;
  selectedTemplate: TemplateSlug | null = null;
  promptState: PromptState = "idle";
  promptText: string | null = null;
  promptConnected: boolean | null = null;
  agentConnected = false;
  agentStatusFailed = false;
  schemaRevision: number | null = null;
  schemaBaseline: number | null = null;
  userId: string | undefined;
  savedProgress: OnboardingWizardProgress | null = null;
  private initializationVersion = 0;
  private promptVersion = 0;
  private saveQueue: Promise<unknown> = Promise.resolve();

  constructor(public readonly rootStore: RootStore) {
    makeAutoObservable<this, "saveQueue" | "initializationVersion" | "promptVersion">(this, {
      rootStore: false,
      saveQueue: false,
      initializationVersion: false,
      promptVersion: false,
    });
  }

  get flowContext(): WizardFlowContext {
    return {
      setupAvailable: this.setupAvailable,
      chooseAvailable: this.chooseAvailable,
      templatesAvailable: this.templatesAvailable,
      sourceAvailable: this.sourceAvailable,
    };
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

  get totalSteps(): number {
    return this.steps.length;
  }

  get isSaving(): boolean {
    return this.pendingSaves > 0;
  }

  get connectsAgent(): boolean {
    return connectsAgentWithVerification(this.flowContext, this.flowKey);
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
      template: this.selectedTemplate,
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
    this.setupAvailable = setupAvailable;
    this.chooseAvailable = flow.chooseAvailable ?? false;
    this.templatesAvailable = flow.templatesAvailable ?? false;
    this.sourceAvailable = flow.sourceAvailable ?? false;
    this.emptyChosen = flow.emptyChosen ?? false;
    this.selfHosted = flow.selfHosted ?? false;
    this.selectedJob = jobChoice.selectedJob;
    this.suggestedJob = jobChoice.suggestedJob;
    this.suggestedPlaybook = jobChoice.suggestedPlaybook ?? null;
    this.selectedPlaybook = this.suggestedPlaybook;
    const resumesSavedStep = this.steps[resumeStepIndex] === "invite";
    this.initializationVersion += 1;
    this.userId = userId;
    this.savedProgress = resumeStepIndex > 0 ? readOnboardingWizardProgress(progress) : null;
    this.goalPinned = this.savedProgress?.step === "goal";
    this.rootStore.stepAiStore.reset(identityChanged);
    this.selectedTemplate = flow.template ?? null;
    this.applyProgress(this.savedProgress ?? readOnboardingWizardProgress(null));
    this.minStepIndex = this.minimumStepIndex(resumeStepIndex);
    this.currentStepIndex =
      resumesSavedStep && this.savedProgress?.step === "ai" ? this.steps.indexOf("ai") : resumeStepIndex;
    this.isInitializing = false;
  };

  private minimumStepIndex(resumeStepIndex: number): number {
    const goal = this.steps.indexOf("goal");
    const step = this.steps[resumeStepIndex];
    const reachesGoal = step === "template" || step === "prompt" || (step === "ai" && this.connectsAgent);
    return this.chooseAvailable && goal !== -1 && reachesGoal ? goal : resumeStepIndex;
  }

  setSelectedJob = (value: string) => {
    const job = parseOnboardingJob(value);
    if (!job || this.isSubmitting) return;
    this.selectedJob = job;
    this.goalPinned = true;
  };

  setSelectedDiscovery = (value: string) => {
    const choice = parseDiscoveryChoice(value);
    if (choice && !this.isSubmitting) this.selectedDiscovery = choice;
  };

  setDiscoveryDetail = (value: string) => {
    this.discoveryDetail = value.slice(0, DISCOVERY_DETAIL_MAX_LENGTH);
  };

  answerSource = async (skip = false): Promise<void> => {
    if (this.isSubmitting || this.currentStep !== "source") return;
    const choice = skip ? null : this.selectedDiscovery;
    if (!skip && choice === null) return;
    this.setIsSubmitting(true);
    try {
      await recordDiscoveryAnswerAction({ choice, detail: this.discoveryDetail }).catch(reportApplicationError);
      if (this.currentStep !== "source") return;
      this.moveTo(this.steps[this.currentStepIndex + 1], { closeBehind: true });
    } finally {
      this.setIsSubmitting(false);
    }
  };

  setSelectedPlaybook = (value: string) => {
    const playbook = parseOnboardingPlaybook(value);
    if (playbook && !this.isSubmitting) this.selectedPlaybook = playbook;
  };

  setSelectedTemplate = (value: string) => {
    if (!isTemplateSlug(value) || this.isSubmitting || this.selectedTemplate === value) return;
    this.selectedTemplate = value;
    this.promptVersion += 1;
    this.promptState = "idle";
    this.promptText = null;
    this.promptConnected = null;
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
      const outcome = result.data;
      if (outcome.next === "playbook") {
        this.moveTo("playbook", { closeBehind: true });
        return;
      }
      if (outcome.next === "ai") {
        if (this.userId && !(await this.persistProgress(this.progressAt("ai", this.goalPinned)))) return;
        this.moveTo("ai", { closeBehind: !this.connectsAgent });
        return;
      }
      this.moveTo(this.templatesAvailable && this.chooseAvailable ? "template" : "setup", {
        closeBehind: !(this.templatesAvailable && this.chooseAvailable),
      });
    } finally {
      this.setIsSubmitting(false);
    }
  };

  startEmptyWorkspace = async (): Promise<void> => {
    if (this.isSubmitting || this.currentStep !== "goal") return;
    this.setIsSubmitting(true);
    try {
      if (this.userId && !(await this.persistProgress(this.progressAt("invite", false)))) return;
      const result = await completeOnboardingSetupStepAction();
      if (!result.ok) {
        toastZodErrorTree(serializedFailureErrorTree(result.failure));
        return;
      }
      if (this.currentStep !== "goal") return;
      runInAction(() => {
        this.emptyChosen = true;
      });
      this.moveTo("invite", { closeBehind: true });
    } finally {
      this.setIsSubmitting(false);
    }
  };

  openCloudTrial = () => {
    globalThis.open(cloudMateSignupUrl(this.rootStore.localeStore.locale), "_blank", "noopener,noreferrer");
    this.cloudTrialOpened = true;
  };

  private moveTo(step: WizardStep, options: { closeBehind: boolean }) {
    runInAction(() => {
      const index = this.steps.indexOf(step);
      if (index === -1) return;
      this.currentStepIndex = index;
      if (options.closeBehind) this.minStepIndex = index;
    });
  }

  private async moveToPersisted(step: WizardStep): Promise<boolean> {
    const version = this.initializationVersion;
    if (this.userId && !(await this.persistProgress(this.progressAt(step, this.goalPinned)))) return false;
    if (version !== this.initializationVersion) return false;
    this.moveTo(step, { closeBehind: false });
    return true;
  }

  continueFromConnect = async (): Promise<void> => {
    if (this.isSubmitting || this.currentStep !== "ai" || !this.connectsAgent) return;
    if (!this.templatesAvailable) {
      await this.complete();
      return;
    }
    await this.moveToPersisted("template");
  };

  confirmTemplate = async (): Promise<void> => {
    if (this.isSubmitting || this.currentStep !== "template" || this.selectedTemplate === null) return;
    if (this.connectsAgent) {
      await this.enterPrompt();
      return;
    }
    this.moveTo("setup", { closeBehind: true });
  };

  skipTemplate = async (): Promise<void> => {
    if (this.isSubmitting || this.currentStep !== "template") return;
    if (this.connectsAgent) {
      await this.complete();
      return;
    }
    runInAction(() => {
      this.selectedTemplate = null;
    });
    this.moveTo("setup", { closeBehind: true });
  };

  private async enterPrompt(): Promise<void> {
    runInAction(() => {
      this.schemaBaseline = null;
    });
    if (await this.moveToPersisted("prompt")) void this.refreshAgentStatus().catch(reportApplicationError);
  }

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
      if (this.currentStep === "prompt" && this.schemaBaseline === null)
        this.schemaBaseline = result.data.schemaRevision;
    });
    if (this.agentConnected && this.promptState === "ready" && this.promptConnected === false)
      await this.reloadPromptWording();
  };

  private async reloadPromptWording(): Promise<void> {
    const slug = this.selectedTemplate;
    if (!slug) return;
    const version = (this.promptVersion += 1);
    runInAction(() => {
      this.promptConnected = null;
    });
    try {
      const result = await getOnboardingTemplatePromptAction({ slug });
      if (version !== this.promptVersion) return;
      runInAction(() => {
        if (result.ok && result.data.prompt !== null) {
          this.promptText = result.data.prompt;
          this.promptConnected = result.data.connected;
        } else this.promptConnected = false;
      });
    } catch (error) {
      if (version === this.promptVersion) runInAction(() => (this.promptConnected = false));
      reportApplicationError(error);
    }
  }

  loadPrompt = async (): Promise<void> => {
    const slug = this.selectedTemplate;
    if (!slug || this.promptState === "loading" || this.promptState === "ready") return;
    const version = (this.promptVersion += 1);
    this.promptState = "loading";
    try {
      const result = await getOnboardingTemplatePromptAction({ slug });
      if (version !== this.promptVersion) return;
      runInAction(() => {
        const prompt = result.ok ? result.data.prompt : null;
        this.promptText = prompt;
        this.promptConnected = result.ok && prompt !== null ? result.data.connected : null;
        this.promptState = prompt === null ? "failed" : "ready";
      });
    } catch (error) {
      if (version === this.promptVersion) runInAction(() => (this.promptState = "failed"));
      reportApplicationError(error);
    }
  };

  retryPrompt = () => {
    this.promptState = "idle";
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
    if (progress.template !== null && isTemplateSlug(progress.template)) this.selectedTemplate = progress.template;
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
    const step = this.steps[this.currentStepIndex + 1];
    if (this.userId && !(await this.persistProgress(this.progressAt(step, this.goalPinned)))) return;
    if (version !== this.initializationVersion) return;
    runInAction(() => {
      this.currentStepIndex += 1;
    });
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
      if (!this.connectsAgent && selectedTool !== null && !canFinish) return;
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
