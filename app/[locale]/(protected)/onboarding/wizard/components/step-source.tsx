"use client";

import { observer } from "mobx-react-lite";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";

import { Ellipsis, Library, Loader2, Megaphone, PlayCircle, Search, UsersRound, type LucideIcon } from "lucide-react";

import { AiClientLogo } from "@/components/ai-connection/ai-client-logo";
import { Instagram, Linkedin, XTwitter } from "@/components/icons/channel-icon";
import { LogoStack } from "@/components/shared/logo-stack";

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

function iconMark(Icon: LucideIcon) {
  return <LogoStack items={[{ key: "icon", node: <Icon className="text-muted-foreground" /> }]} size="sm" />;
}

const CHOICE_MARKS: Record<DiscoveryChoice, ReactNode> = {
  searchEngine: iconMark(Search),
  advertisement: iconMark(Megaphone),
  aiAssistant: (
    <LogoStack
      items={(["chatgpt", "claude", "gemini"] as const).map((provider) => ({
        key: provider,
        node: <AiClientLogo provider={provider} />,
      }))}
      size="sm"
    />
  ),
  directory: iconMark(Library),
  socialMedia: (
    <LogoStack
      items={[
        { key: "linkedin", node: <Linkedin /> },
        { key: "instagram", node: <Instagram /> },
        { key: "x", node: <XTwitter /> },
      ]}
      size="sm"
    />
  ),
  recommendation: iconMark(UsersRound),
  articleOrVideo: iconMark(PlayCircle),
  other: iconMark(Ellipsis),
};

export const StepSource = observer(() => {
  const t = useTranslations();
  const { onboardingWizardStore: store } = useRootStore();
  const disabled = store.isSubmitting || store.isSaving || store.isInitializing;
  const labels: Record<DiscoveryChoice, string> = {
    searchEngine: t("OnboardingWizard.source.choices.searchEngine"),
    advertisement: t("OnboardingWizard.source.choices.advertisement"),
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
            labelClassName="flex-row items-center justify-between gap-3"
            selectionMode="single"
            value={choice}
            visual={CHOICE_MARKS[choice]}
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

      <div className="mt-2 flex flex-wrap items-center justify-end gap-2 max-sm:flex-col-reverse max-sm:items-stretch">
        <Button
          disabled={disabled}
          id="onboarding-source-skip"
          type="button"
          variant="secondary"
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
