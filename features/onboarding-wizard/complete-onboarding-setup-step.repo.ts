export abstract class CompleteOnboardingSetupStepRepo {
  abstract markOnboardingSetupStepCompleted(args: { userId: string }): Promise<void>;
}
