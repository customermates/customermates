"use client";

import type { AutomationRecipe } from "@/features/automation-rules/recipes";
import type { AutomationBuilderStore } from "./automation-builder.store";

import { Plus, Sparkles } from "lucide-react";
import { observer } from "mobx-react-lite";
import { useTranslations } from "next-intl";

import { recipeText } from "@/components/automations/automation-recipe-text";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { runUserAction } from "@/core/errors/report-application-error";
import { COMPOSE_SENTENCE_MAX_CHARS } from "@/ee/automation-compose/compose-automation.schema";
import { availableRecipes } from "@/features/automation-rules/recipes";
import { IntlLink } from "@/i18n/navigation";

import { AGENT_SETTINGS_HREF } from "./automation-agent-fields";
import { recipeToDraft } from "./automation-recipe-draft";

function refusalText(t: ReturnType<typeof useTranslations>, reason: string): string {
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
  store: AutomationBuilderStore;
  onRoutineRecipe: (recipe: AutomationRecipe, text: { title: string; prompt: string }) => void;
};

export const AutomationStartScreen = observer(function AutomationStartScreen({ store, onRoutineRecipe }: Props) {
  const t = useTranslations();
  const { context } = store;
  if (!context) return null;

  const recipes = availableRecipes({ cloud: context.cloud });
  const runtime = (["mate", "ownKey", "runner"] as const).find((kind) => context.runtimes[kind].available) ?? "mate";

  const choose = (recipe: AutomationRecipe) => {
    const text = recipeText(t, recipe.id);
    if (recipe.kind === "routine") {
      onRoutineRecipe(recipe, { title: text.title, prompt: text.effects[0] ?? "" });
      return;
    }
    store.applyDraft(recipeToDraft(recipe, context.model, { timezone: context.timezone, text, runtime }));
  };

  return (
    <div className="flex flex-col gap-6" data-automation-start="">
      {context.composer && (
        <form
          className="flex flex-col gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            runUserAction(() => store.compose());
          }}
        >
          <label className="flex items-center gap-2 text-sm font-medium" htmlFor="automation-composer">
            <Sparkles aria-hidden="true" className="size-4" />

            {t("Automations.start.composerLabel")}
          </label>

          <Textarea
            id="automation-composer"
            maxLength={COMPOSE_SENTENCE_MAX_CHARS}
            placeholder={t("Automations.start.composerPlaceholder")}
            rows={3}
            value={store.composerText}
            onChange={(event) => store.setComposerText(event.target.value)}
          />

          <div className="flex flex-wrap items-center gap-3">
            <Button disabled={store.composing || !store.composerText.trim()} type="submit">
              {store.composing ? (
                <Spinner aria-label={t("PageState.loading")} />
              ) : (
                <Sparkles aria-hidden="true" className="size-4" />
              )}

              {t("Automations.start.compose")}
            </Button>

            <span className="text-xs text-muted-foreground">{t("Automations.start.composerNote")}</span>
          </div>

          {store.composerRefusal && (
            <p
              className="text-sm text-warning-soft-foreground"
              data-composer-refusal={store.composerRefusal}
              role="status"
            >
              {refusalText(t, store.composerRefusal)}
            </p>
          )}
        </form>
      )}

      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-1">
          <h3 className="text-base font-semibold">{t("Automations.start.recipesTitle")}</h3>

          <p className="text-sm text-muted-foreground">{t("Automations.start.recipesBody")}</p>
        </div>

        <ul className={context.composer ? "flex flex-wrap gap-2" : "grid gap-3 sm:grid-cols-2"}>
          {recipes.map((recipe) => {
            const text = recipeText(t, recipe.id);
            return (
              <li key={recipe.id} className={context.composer ? undefined : "flex"}>
                {context.composer ? (
                  <Button
                    data-automation-recipe={recipe.id}
                    size="sm"
                    variant="secondary"
                    onClick={() => choose(recipe)}
                  >
                    {text.title}
                  </Button>
                ) : (
                  <button
                    className="flex w-full flex-col gap-1 rounded-xl border bg-card p-4 text-left transition-colors hover:bg-accent/50 focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
                    data-automation-recipe={recipe.id}
                    type="button"
                    onClick={() => choose(recipe)}
                  >
                    <span className="text-sm font-semibold">{text.title}</span>

                    <span className="text-sm text-muted-foreground">{text.description}</span>

                    <span className="mt-2 text-xs text-muted-foreground">
                      {recipe.usesAgent ? t("Automations.start.usesAgent") : t("Automations.start.exact")}
                    </span>
                  </button>
                )}
              </li>
            );
          })}

          <li className={context.composer ? undefined : "flex"}>
            <Button
              className={context.composer ? undefined : "h-auto w-full flex-col gap-1 border-dashed py-4"}
              data-automation-scratch=""
              size={context.composer ? "sm" : "default"}
              variant="secondary"
              onClick={store.startFromScratch}
            >
              <span className="flex items-center gap-1.5">
                <Plus aria-hidden="true" className="size-4" />

                {t("Automations.start.scratch")}
              </span>

              {!context.composer && (
                <span className="text-xs font-normal text-muted-foreground">{t("Automations.start.scratchBody")}</span>
              )}
            </Button>
          </li>
        </ul>

        {!Object.values(context.runtimes).some((option) => option.available) && (
          <p className="flex flex-wrap gap-x-1 text-xs text-muted-foreground">
            <span>{t("Automations.start.noAgent")}</span>

            <IntlLink className="underline" href={AGENT_SETTINGS_HREF}>
              {t("Automations.agent.openSettings")}
            </IntlLink>
          </p>
        )}
      </div>
    </div>
  );
});
