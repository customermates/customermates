import type { useTranslations } from "next-intl";

import type { AiConnectionProvider } from "@/components/ai-connection/ai-connection.store";
import type { TemplateIndexEntry } from "@/core/templates/template-index.types";

type Translate = ReturnType<typeof useTranslations>;

export function aiProviderLabels(t: Translate): Record<AiConnectionProvider, string> {
  return {
    claude: t("OnboardingWizard.ai.choices.claude"),
    openai: t("OnboardingWizard.ai.choices.openai"),
    cursor: t("OnboardingWizard.ai.choices.cursor"),
    gemini: t("OnboardingWizard.ai.choices.gemini"),
  };
}

export function templateFamilyLabel(t: Translate, family: TemplateIndexEntry["family"]): string {
  switch (family) {
    case "sales":
      return t("OnboardingWizard.template.families.sales");
    case "clients":
      return t("OnboardingWizard.template.families.clients");
    case "property":
      return t("OnboardingWizard.template.families.property");
    case "recruiting":
      return t("OnboardingWizard.template.families.recruiting");
    case "professional-services":
      return t("OnboardingWizard.template.families.professionalServices");
    case "operations":
      return t("OnboardingWizard.template.families.operations");
    case "content":
      return t("OnboardingWizard.template.families.content");
    case "intake":
      return t("OnboardingWizard.template.families.intake");
    case "community":
      return t("OnboardingWizard.template.families.community");
    case "trades":
      return t("OnboardingWizard.template.families.trades");
    case "investing":
      return t("OnboardingWizard.template.families.investing");
    case "custom":
      return t("OnboardingWizard.template.families.custom");
  }
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
