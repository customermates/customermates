export type OnboardingAgentStatus = {
  connected: boolean;
  schemaRevision: number;
};

export abstract class RecordAgentFirstCallRepo {
  abstract recordAgentFirstCall(): Promise<boolean>;
}

export abstract class OnboardingAgentStatusRepo {
  abstract findOnboardingAgentStatus(): Promise<OnboardingAgentStatus>;
}
