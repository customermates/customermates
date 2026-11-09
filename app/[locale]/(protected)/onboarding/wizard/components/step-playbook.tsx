"use client";

import { observer } from "mobx-react-lite";
import { useTranslations } from "next-intl";
import { BookOpen, Briefcase, Laptop, Loader2, Megaphone, Store } from "lucide-react";

import { SelectableCard } from "@/components/forms/selectable-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { RadioGroup } from "@/components/ui/radio-group";
import { runUserAction } from "@/core/errors/report-application-error";
import { useRootStore } from "@/core/stores/root-store.provider";
import { ONBOARDING_PLAYBOOKS } from "@/features/onboarding-funnel/onboarding-playbook";

const PLAYBOOK_ICONS = { consultants: Briefcase, agencies: Megaphone, freelancers: Laptop, smb: Store } as const;

export const StepPlaybook = observer(() => {
  const t = useTranslations();
  const copy = {
    consultants: {
      title: t("OnboardingPlaybooks.consultants.label"),
      description: t("OnboardingPlaybooks.consultants.description"),
    },
    agencies: {
      title: t("OnboardingPlaybooks.agencies.label"),
      description: t("OnboardingPlaybooks.agencies.description"),
    },
    freelancers: {
      title: t("OnboardingPlaybooks.freelancers.label"),
      description: t("OnboardingPlaybooks.freelancers.description"),
    },
    smb: { title: t("OnboardingPlaybooks.smb.label"), description: t("OnboardingPlaybooks.smb.description") },
  };
  const pages = [
    t("OnboardingPlaybooks.pages.salesPlaybook"),
    t("OnboardingPlaybooks.pages.toneOfVoice"),
    t("OnboardingPlaybooks.pages.followUps"),
  ];
  const { onboardingWizardStore: store } = useRootStore();
  const disabled = store.isSubmitting || store.isSaving || store.isInitializing;

  return (
    <div className="flex flex-col gap-4">
      <RadioGroup
        aria-label={t("OnboardingWizard.playbook.optionsLabel")}
        className="grid grid-cols-1 gap-3 sm:grid-cols-2"
        disabled={disabled}
        value={store.selectedPlaybook ?? ""}
        onValueChange={store.setSelectedPlaybook}
      >
        {ONBOARDING_PLAYBOOKS.map((playbook) => {
          const Icon = PLAYBOOK_ICONS[playbook];
          return (
            <SelectableCard
              key={playbook}
              description={copy[playbook].description}
              disabled={disabled}
              id={`onboarding-playbook-${playbook}`}
              label={copy[playbook].title}
              leading={<Icon aria-hidden="true" className="size-4 text-primary" />}
              selectionMode="single"
              value={playbook}
              visual={
                store.suggestedPlaybook === playbook ? (
                  <Badge className="mt-1" variant="secondary">
                    {t("OnboardingWizard.goal.suggested")}
                  </Badge>
                ) : undefined
              }
            />
          );
        })}
      </RadioGroup>

      <div className="flex items-start gap-3 rounded-lg border bg-muted/40 p-3">
        <BookOpen aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-primary" />

        <div className="flex flex-col gap-1">
          <p className="text-sm font-medium">{t("OnboardingWizard.playbook.writesTitle")}</p>

          <p className="text-xs text-muted-foreground">
            {t("OnboardingWizard.playbook.writesDescription", { pages: pages.join(", ") })}
          </p>
        </div>
      </div>

      <div className="mt-2 flex flex-wrap items-center justify-end gap-2">
        <Button
          disabled={disabled}
          id="onboarding-playbook-skip"
          type="button"
          variant="ghost"
          onClick={() => runUserAction(() => store.applyPlaybook(true))}
        >
          {t("OnboardingWizard.playbook.skip")}
        </Button>

        <Button
          disabled={disabled || store.selectedPlaybook === null}
          id="onboarding-playbook-continue"
          type="button"
          onClick={() => runUserAction(() => store.applyPlaybook())}
        >
          {store.isSubmitting && <Loader2 className="size-4 animate-spin" />}

          {t("OnboardingWizard.playbook.continue")}
        </Button>
      </div>
    </div>
  );
});
