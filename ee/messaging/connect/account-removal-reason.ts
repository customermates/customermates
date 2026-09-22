export const ACCOUNT_REMOVAL_REASONS = [
  "planDowngrade",
  "trialExpired",
  "subscriptionLapsed",
  "ownerInactive",
] as const;

export type AccountRemovalReason = (typeof ACCOUNT_REMOVAL_REASONS)[number];
