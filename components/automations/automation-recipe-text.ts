import type { useTranslations } from "next-intl";
import type { AutomationRecipeId } from "@/features/automation-rules/recipes";

import { RECORD_NAME_TOKEN } from "@/features/automation-rules/automation-template";

type Translate = ReturnType<typeof useTranslations>;

export type RecipeText = { title: string; description: string; effects: string[] };

const values = { record: RECORD_NAME_TOKEN };

const TEXT: Record<AutomationRecipeId, (t: Translate) => RecipeText> = {
  answerEnquiries: (t) => ({
    title: t("Automations.recipes.answerEnquiries.title", values),
    description: t("Automations.recipes.answerEnquiries.description", values),
    effects: [
      t("Automations.recipes.answerEnquiries.effects.agent", values),
      t("Automations.recipes.answerEnquiries.effects.notify", values),
    ],
  }),
  followUpAfterOffer: (t) => ({
    title: t("Automations.recipes.followUpAfterOffer.title", values),
    description: t("Automations.recipes.followUpAfterOffer.description", values),
    effects: [
      t("Automations.recipes.followUpAfterOffer.effects.action", values),
      t("Automations.recipes.followUpAfterOffer.effects.notify", values),
    ],
  }),
  remindBeforeRenewal: (t) => ({
    title: t("Automations.recipes.remindBeforeRenewal.title", values),
    description: t("Automations.recipes.remindBeforeRenewal.description", values),
    effects: [
      t("Automations.recipes.remindBeforeRenewal.effects.action", values),
      t("Automations.recipes.remindBeforeRenewal.effects.notify", values),
    ],
  }),
  welcomeSubmission: (t) => ({
    title: t("Automations.recipes.welcomeSubmission.title", values),
    description: t("Automations.recipes.welcomeSubmission.description", values),
    effects: [
      t("Automations.recipes.welcomeSubmission.effects.action", values),
      t("Automations.recipes.welcomeSubmission.effects.notify", values),
    ],
  }),
  chaseDocuments: (t) => ({
    title: t("Automations.recipes.chaseDocuments.title", values),
    description: t("Automations.recipes.chaseDocuments.description", values),
    effects: [
      t("Automations.recipes.chaseDocuments.effects.action", values),
      t("Automations.recipes.chaseDocuments.effects.notify", values),
    ],
  }),
  weeklyReview: (t) => ({
    title: t("Automations.recipes.weeklyReview.title", values),
    description: t("Automations.recipes.weeklyReview.description", values),
    effects: [t("Automations.recipes.weeklyReview.effects.agent", values)],
  }),
  wonOrLostReason: (t) => ({
    title: t("Automations.recipes.wonOrLostReason.title", values),
    description: t("Automations.recipes.wonOrLostReason.description", values),
    effects: [t("Automations.recipes.wonOrLostReason.effects.notify", values)],
  }),
  bookingCancelled: (t) => ({
    title: t("Automations.recipes.bookingCancelled.title", values),
    description: t("Automations.recipes.bookingCancelled.description", values),
    effects: [t("Automations.recipes.bookingCancelled.effects.notify", values)],
  }),
};

export function recipeText(t: Translate, id: AutomationRecipeId): RecipeText {
  return TEXT[id](t);
}
