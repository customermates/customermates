export abstract class CompleteOnboardingWikiStepRepo {
  abstract markOnboardingWikiStepCompleted(args: { userId: string }): Promise<void>;
}
