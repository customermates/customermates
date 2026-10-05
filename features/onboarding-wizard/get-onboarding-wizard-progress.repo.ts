export abstract class GetOnboardingWizardProgressRepo {
  abstract findOnboardingWizardProgressOrThrow(): Promise<unknown>;
}
