"use client";

import { useTranslations } from "next-intl";
import { useActionState } from "react";

import { chooseWorkspaceAction } from "./actions";

import { AppCard } from "@/components/card/app-card";
import { AppCardBody } from "@/components/card/app-card-body";
import { CardHeroHeader } from "@/components/card/card-hero-header";
import { ChoiceCard } from "@/components/shared/choice-card";
import { useRootStore } from "@/core/stores/root-store.provider";

type Props = {
  trialDays: number | null;
};

export function OnboardingChoiceCard({ trialDays }: Props) {
  const t = useTranslations();
  const { appMode } = useRootStore();
  const [, formAction, isPending] = useActionState(chooseWorkspaceAction, null);

  return (
    <AppCard className="max-w-2xl">
      <CardHeroHeader alt="" subtitle={t("OnboardingChoice.subtitle")} title={t("OnboardingChoice.title")} />

      <AppCardBody className="gap-5 pt-2">
        <form action={formAction} aria-busy={isPending}>
          <div
            aria-label={t("OnboardingChoice.optionsLabel")}
            className="grid grid-cols-1 gap-3 sm:grid-cols-2"
            role="group"
          >
            <ChoiceCard
              description={t("OnboardingChoice.create.description")}
              disabled={isPending}
              name="workspaceChoice"
              note={
                appMode === "cloud" && trialDays !== null
                  ? t("OnboardingChoice.create.note", { days: trialDays })
                  : undefined
              }
              title={t("OnboardingChoice.create.title")}
              type="submit"
              value="create"
            />

            <ChoiceCard
              description={t("OnboardingChoice.join.description")}
              disabled={isPending}
              name="workspaceChoice"
              note={t("OnboardingChoice.join.note")}
              title={t("OnboardingChoice.join.title")}
              type="submit"
              value="join"
            />
          </div>

          <span aria-live="polite" className="sr-only" role="status">
            {isPending ? t("PageState.loading") : ""}
          </span>
        </form>

        <p className="text-center text-xs leading-relaxed text-muted-foreground">{t("OnboardingChoice.footnote")}</p>
      </AppCardBody>
    </AppCard>
  );
}
