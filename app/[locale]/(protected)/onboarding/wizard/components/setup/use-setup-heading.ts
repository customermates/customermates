import { useTranslations } from "next-intl";

import { useRootStore } from "@/core/stores/root-store.provider";
import { setupPartVisible } from "@/features/workspace-setup/setup-interview";

export type SetupHeading = {
  title: string;
  subtitle: string | null;
  question: { current: number; total: number } | null;
};

export function useSetupHeading(): SetupHeading {
  const t = useTranslations();
  const { workspaceSetupStore: store } = useRootStore();
  switch (store.stage) {
    case "interview": {
      const question = { current: store.questionNumber, total: store.questions.length };
      switch (store.currentQuestion.id) {
        case "workWith":
          return { title: t("WorkspaceSetup.questions.workWith.label"), subtitle: null, question };
        case "purpose":
          return {
            title: t("WorkspaceSetup.questions.purpose.label"),
            subtitle: t("WorkspaceSetup.questions.purpose.hint"),
            question,
          };
        case "mainSteps":
          return {
            title: t("WorkspaceSetup.questions.mainSteps.label"),
            subtitle: t("WorkspaceSetup.questions.mainSteps.hint"),
            question,
          };
        default:
          return {
            title: setupPartVisible("pricing", store.answers)
              ? t("WorkspaceSetup.questions.pricing.label")
              : t("WorkspaceSetup.questions.existingData.title"),
            subtitle: null,
            question,
          };
      }
    }
    case "followUps":
      return {
        title: t("WorkspaceSetup.interview.followUpsTitle"),
        subtitle: t("WorkspaceSetup.interview.followUpsSubtitle"),
        question: null,
      };
    case "build":
      return { title: t("WorkspaceSetup.build.title"), subtitle: null, question: null };
    case "planning":
    case "planFailed":
    case "plan":
      return { title: t("WorkspaceSetup.plan.title"), subtitle: t("WorkspaceSetup.plan.subtitle"), question: null };
    case "start":
    case "unavailable":
      return { title: t("WorkspaceSetup.questions.workWith.label"), subtitle: null, question: null };
  }
}
