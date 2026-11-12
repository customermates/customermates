"use client";

import { observer } from "mobx-react-lite";
import { useTranslations } from "next-intl";
import { Loader2 } from "lucide-react";

import { SelectableCard } from "@/components/forms/selectable-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { RadioGroup } from "@/components/ui/radio-group";
import { runUserAction } from "@/core/errors/report-application-error";
import { useRootStore } from "@/core/stores/root-store.provider";
import {
  DISCOVERY_CHOICES,
  DISCOVERY_DETAIL_MAX_LENGTH,
  type DiscoveryChoice,
} from "@/features/onboarding-funnel/discovery-answer";

export const StepSource = observer(() => {
  const t = useTranslations();
  const { onboardingWizardStore: store } = useRootStore();
  const disabled = store.isSubmitting || store.isSaving || store.isInitializing;
  const labels: Record<DiscoveryChoice, string> = {
    searchEngine: t("OnboardingWizard.source.choices.searchEngine"),
    aiAssistant: t("OnboardingWizard.source.choices.aiAssistant"),
    directory: t("OnboardingWizard.source.choices.directory"),
    socialMedia: t("OnboardingWizard.source.choices.socialMedia"),
    recommendation: t("OnboardingWizard.source.choices.recommendation"),
    articleOrVideo: t("OnboardingWizard.source.choices.articleOrVideo"),
    other: t("OnboardingWizard.source.choices.other"),
  };

  return (
    <div className="flex flex-col gap-4">
      <RadioGroup
        aria-label={t("OnboardingWizard.source.optionsLabel")}
        className="grid grid-cols-1 gap-3 sm:grid-cols-2"
        disabled={disabled}
        value={store.selectedDiscovery ?? ""}
        onValueChange={store.setSelectedDiscovery}
      >
        {DISCOVERY_CHOICES.map((choice) => (
          <SelectableCard
            key={choice}
            disabled={disabled}
            id={`onboarding-source-${choice}`}
            label={labels[choice]}
            selectionMode="single"
            value={choice}
          />
        ))}
      </RadioGroup>

      {store.selectedDiscovery === "other" ? (
        <Input
          aria-label={t("OnboardingWizard.source.detailLabel")}
          disabled={disabled}
          id="onboarding-source-detail"
          maxLength={DISCOVERY_DETAIL_MAX_LENGTH}
          placeholder={t("OnboardingWizard.source.detailPlaceholder")}
          value={store.discoveryDetail}
          onChange={(event) => store.setDiscoveryDetail(event.target.value)}
        />
      ) : null}

      <div className="mt-2 flex flex-wrap items-center justify-end gap-2">
        <Button
          disabled={disabled}
          id="onboarding-source-skip"
          type="button"
          variant="ghost"
          onClick={() => runUserAction(() => store.answerSource(true))}
        >
          {t("OnboardingWizard.source.skip")}
        </Button>

        <Button
          disabled={disabled || store.selectedDiscovery === null}
          id="onboarding-source-continue"
          type="button"
          onClick={() => runUserAction(() => store.answerSource())}
        >
          {store.isSubmitting && <Loader2 className="size-4 animate-spin motion-reduce:animate-none" />}

          {t("OnboardingWizard.continue")}
        </Button>
      </div>
    </div>
  );
});
