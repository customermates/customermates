"use server";

import type { OnboardingTemplateCard } from "@/features/onboarding-templates/onboarding-template-offer";

import { getLocale } from "next-intl/server";

import { templateDeployment } from "@/core/templates/template-deployment";
import { offeredTemplateCards } from "@/features/onboarding-templates/onboarding-template-offer";
import { appLocaleOrDefault } from "@/i18n/locale-registry";

export async function listLibraryTemplatesAction(): Promise<OnboardingTemplateCard[]> {
  const locale = appLocaleOrDefault(await getLocale());
  return offeredTemplateCards({ locale, deployment: templateDeployment() });
}
