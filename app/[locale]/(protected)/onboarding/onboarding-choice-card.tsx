"use client";

import { useTranslations } from "next-intl";
import { useActionState } from "react";

import { chooseWorkspaceAction } from "./actions";

import { AppCard } from "@/components/card/app-card";
import { AppCardBody } from "@/components/card/app-card-body";
import { CardHeroHeader } from "@/components/card/card-hero-header";
import { Button } from "@/components/ui/button";
import { useRootStore } from "@/core/stores/root-store.provider";

type ChoiceProps = {
  choice: "create" | "join";
  description: string;
  isPending: boolean;
  note?: string;
  title: string;
};

function WorkspaceChoice({ choice, description, isPending, note, title }: ChoiceProps) {
  return (
    <Button
      className="relative h-auto min-h-36 w-full flex-col items-start justify-start whitespace-normal rounded-xl p-4 text-left"
      disabled={isPending}
      name="workspaceChoice"
      type="submit"
      value={choice}
      variant="secondary"
    >
      <span className="flex w-full items-start justify-between gap-2">
        <span className="text-sm font-medium">{title}</span>
      </span>

      <span className="text-xs font-normal leading-relaxed text-muted-foreground">{description}</span>

      {note ? (
        <span className="mt-auto pt-2 text-[11px] font-normal leading-relaxed text-muted-foreground">{note}</span>
      ) : null}
    </Button>
  );
}

type Props = {
  email: string;
  trialDays: number;
};

export function OnboardingChoiceCard({ email, trialDays }: Props) {
  const t = useTranslations();
  const { appMode } = useRootStore();
  const [, formAction, isPending] = useActionState(chooseWorkspaceAction, null);

  return (
    <AppCard className="max-w-2xl">
      <CardHeroHeader alt="" subtitle={t("OnboardingChoice.subtitle")} title={t("OnboardingChoice.title")} />

      <AppCardBody className="gap-5 pt-2">
        <p className="mx-auto max-w-full rounded-full border border-border bg-muted/40 px-3 py-1.5 text-center text-xs text-muted-foreground [overflow-wrap:anywhere]">
          {t("OnboardingChoice.signedInAs", { email })}
        </p>

        <form action={formAction} aria-busy={isPending}>
          <div
            aria-label={t("OnboardingChoice.optionsLabel")}
            className="grid grid-cols-1 gap-3 sm:grid-cols-2"
            role="group"
          >
            <WorkspaceChoice
              choice="create"
              description={t("OnboardingChoice.create.description")}
              isPending={isPending}
              note={appMode === "cloud" ? t("OnboardingChoice.create.note", { days: trialDays }) : undefined}
              title={t("OnboardingChoice.create.title")}
            />

            <WorkspaceChoice
              choice="join"
              description={t("OnboardingChoice.join.description")}
              isPending={isPending}
              note={t("OnboardingChoice.join.note")}
              title={t("OnboardingChoice.join.title")}
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
