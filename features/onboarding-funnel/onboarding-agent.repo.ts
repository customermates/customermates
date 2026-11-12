export type OnboardingAgentStatus = {
  connected: boolean;
  schemaRevision: number;
};

export abstract class OnboardingAgentStatusRepo {
  abstract findOnboardingAgentStatus(): Promise<OnboardingAgentStatus>;
}
