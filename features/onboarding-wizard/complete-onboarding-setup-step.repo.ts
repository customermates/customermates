export abstract class CompleteOnboardingSetupStepRepo {
  abstract markOnboardingSetupStepCompleted(args: { userId: string }): Promise<void>;
  abstract reopenOnboardingSetupStep(args: { userId: string }): Promise<void>;
}
