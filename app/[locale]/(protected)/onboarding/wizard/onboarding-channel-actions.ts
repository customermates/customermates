"use server";

import type { ConnectChannel } from "@/ee/messaging/connect/connect-channels";

import { getRecordChannelSkippedInteractor } from "@/core/di";
import { serializeTypedResult } from "@/core/utils/action-result";
import { startConnectAccountAction } from "@/app/[locale]/(protected)/w/[workspace]/settings/(account)/channels/actions";

export async function recordChannelSkippedAction() {
  return serializeTypedResult(getRecordChannelSkippedInteractor().invoke());
}

export async function startOnboardingChannelConnectAction(channel: ConnectChannel) {
  return startConnectAccountAction(channel, "onboarding");
}
