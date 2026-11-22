"use client";

import type { LucideIcon } from "lucide-react";
import type { CreatePaletteTemplate } from "@/components/create-palette/create-palette";
import type { AutomationRecipe, RecipeTrigger } from "@/features/automation-rules/recipes";
import type { AutomationCreatePaletteStore } from "./automation-create-palette.store";

import { CalendarX, Clock, FileText, Repeat, TrendingUp } from "lucide-react";
import { observer } from "mobx-react-lite";
import { useTranslations } from "next-intl";

import { recipeText } from "@/components/automations/automation-recipe-text";
import { CreatePalette } from "@/components/create-palette/create-palette";
import { runUserAction } from "@/core/errors/report-application-error";
import { availableRecipes } from "@/features/automation-rules/recipes";

import { recipeToDraft } from "./automation-recipe-draft";

type Translate = ReturnType<typeof useTranslations>;

type RecipeTemplate = CreatePaletteTemplate & { recipe: AutomationRecipe };

const TRIGGER_ICONS: Record<RecipeTrigger["kind"], LucideIcon> = {
  formSubmitted: FileText,
  bookingChanged: CalendarX,
  stageChanged: TrendingUp,
  stageUpdated: TrendingUp,
  dateReached: Clock,
  schedule: Repeat,
};

export function composeRefusalText(t: Translate, reason: string): string {
  switch (reason) {
    case "unsupported":
      return t("Automations.start.refusal.unsupported");
    case "invalid":
      return t("Automations.start.refusal.invalid");
    case "unavailable":
      return t("Automations.start.refusal.unavailable");
    case "credits":
      return t("Automations.start.refusal.credits");
    case "rateLimited":
      return t("Automations.start.refusal.rateLimited");
    default:
      return t("Automations.start.refusal.unclear");
  }
}

type Props = {
  store: AutomationCreatePaletteStore;
  onRoutineRecipe: (recipe: AutomationRecipe, text: { title: string; prompt: string }) => void;
};

export const AutomationCreatePalette = observer(function AutomationCreatePalette({ store, onRoutineRecipe }: Props) {
  const t = useTranslations();
  const { context } = store;
  if (!context) return null;

  const runtime = (["mate", "ownKey", "runner"] as const).find((kind) => context.runtimes[kind].available) ?? "mate";
  const templates: RecipeTemplate[] = availableRecipes({ cloud: context.cloud }).map((recipe) => {
    const text = recipeText(t, recipe.id);
    return {
      id: recipe.id,
      recipe,
      title: text.title,
      description: text.description,
      keywords: text.effects,
      icon: TRIGGER_ICONS[recipe.trigger.kind],
      badge: recipe.usesAgent
        ? { label: t("CreatePalette.automation.agent"), tone: "ink" }
        : { label: t("CreatePalette.automation.exact"), tone: "outline" },
    };
  });

  const choose = ({ recipe }: RecipeTemplate) => {
    const text = recipeText(t, recipe.id);
    if (recipe.kind === "routine") {
      store.close();
      onRoutineRecipe(recipe, { title: text.title, prompt: text.effects[0] ?? "" });
      return;
    }
    store.openDraft(recipeToDraft(recipe, context.model, { timezone: context.timezone, text, runtime }));
  };

  return (
    <CreatePalette
      ai={
        context.composer
          ? {
              label: t("CreatePalette.automation.ai"),
              pending: store.composing,
              notice: store.refusal ? composeRefusalText(t, store.refusal) : null,
              onSelect: () => runUserAction(() => store.compose()),
            }
          : null
      }
      blank={{
        label: t("CreatePalette.blank"),
        description: t("CreatePalette.automation.blankDescription"),
        onSelect: store.openBlank,
      }}
      open={store.isOpen}
      placeholder={context.composer ? t("CreatePalette.automation.placeholder") : t("CreatePalette.searchPlaceholder")}
      query={store.query}
      templates={templates}
      title={t("AutomationRules.new")}
      onClose={store.close}
      onQueryChange={store.setQuery}
      onTemplate={choose}
    />
  );
});
