import { useTranslations } from "next-intl";

import { useRootStore } from "@/core/stores/root-store.provider";

export function useSelectedAgentName(): string | null {
  const t = useTranslations();
  const { stepAiStore } = useRootStore();
  switch (stepAiStore.selectedProvider) {
    case null:
      return null;
    case "claude":
      return t("OnboardingWizard.ai.choices.claude");
    case "cursor":
      return t("OnboardingWizard.ai.choices.cursor");
    case "gemini":
      return t("OnboardingWizard.ai.choices.gemini");
    case "openai":
      return stepAiStore.openAiMethod === "codex"
        ? t("OnboardingWizard.ai.choices.codex")
        : t("OnboardingWizard.ai.choices.chatgpt");
  }
}
