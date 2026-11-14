"use server";

import type { TemplateSlug } from "@/core/templates/template-slugs";
import type { ConnectChannel } from "@/ee/messaging/connect/connect-channels";

import { getLocale } from "next-intl/server";

import {
  getGetOnboardingAgentStatusInteractor,
  getGetOnboardingTemplatePromptInteractor,
  getRecordChannelSkippedInteractor,
} from "@/core/di";
import { serializeTypedResult } from "@/core/utils/action-result";
import { appLocaleOrDefault } from "@/i18n/locale-registry";
import { startConnectAccountAction } from "@/app/[locale]/(protected)/w/[workspace]/settings/(account)/channels/actions";

export async function getOnboardingAgentStatusAction() {
  return serializeTypedResult(getGetOnboardingAgentStatusInteractor().invoke());
}

export async function getOnboardingTemplatePromptAction(data: { slug: TemplateSlug }) {
  const locale = appLocaleOrDefault(await getLocale());
  return serializeTypedResult(getGetOnboardingTemplatePromptInteractor().invoke({ slug: data.slug, locale }));
}

export async function recordChannelSkippedAction() {
  return serializeTypedResult(getRecordChannelSkippedInteractor().invoke());
}

export async function startOnboardingChannelConnectAction(channel: ConnectChannel) {
  return startConnectAccountAction(channel);
}
