import type { useTranslations } from "next-intl";

import type { TemplateIndexEntry } from "@/core/templates/template-index.types";

type Translate = ReturnType<typeof useTranslations>;

export function templateFamilyLabel(t: Translate, family: TemplateIndexEntry["family"]): string {
  return t(`OnboardingWizard.template.families.${family}`);
}

export function agentChecklist(t: Translate): string[] {
  return [
    t("OnboardingWizard.goal.agent.steps.connect"),
    t("OnboardingWizard.goal.agent.steps.template"),
    t("OnboardingWizard.goal.agent.steps.approve"),
  ];
}

export function promptChecklist(t: Translate, agent: string | null): string[] {
  return [
    t("OnboardingWizard.prompt.steps.copy"),
    agent ? t("OnboardingWizard.prompt.steps.paste", { agent }) : t("OnboardingWizard.prompt.steps.pasteGeneric"),
    t("OnboardingWizard.prompt.steps.approve"),
  ];
}
