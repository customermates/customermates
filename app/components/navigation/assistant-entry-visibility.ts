import type { SubscriptionDto } from "@/ee/subscription/get-subscription.interactor";

import { getEntitlements, isSubscriptionUsable } from "@/ee/subscription/entitlements";

type AssistantEntryState = {
  agentChatEnabled: boolean;
  restricted: boolean;
  configEnabled: boolean | null;
  subscription: Pick<SubscriptionDto, "status" | "plan" | "trialEndDate"> | null;
};

export function assistantEntryVisible({
  agentChatEnabled,
  restricted,
  configEnabled,
  subscription,
}: AssistantEntryState): boolean {
  if (!agentChatEnabled) return false;
  if (restricted || configEnabled === true) return true;
  if (configEnabled === false) return false;
  return !subscription || (isSubscriptionUsable(subscription) && getEntitlements(subscription.plan).agentChat);
}
