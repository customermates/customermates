"use server";

import type { TemplateSlug } from "@/core/templates/template-slugs";

import { getLocale } from "next-intl/server";

import { getGetOnboardingAgentStatusInteractor, getGetOnboardingTemplatePromptInteractor } from "@/core/di";
import { serializeTypedResult } from "@/core/utils/action-result";
import { appLocaleOrDefault } from "@/i18n/locale-registry";

export async function getOnboardingAgentStatusAction() {
  return serializeTypedResult(getGetOnboardingAgentStatusInteractor().invoke());
}

export async function getOnboardingTemplatePromptAction(data: { slug: TemplateSlug }) {
  const locale = appLocaleOrDefault(await getLocale());
  return serializeTypedResult(getGetOnboardingTemplatePromptInteractor().invoke({ slug: data.slug, locale }));
}
