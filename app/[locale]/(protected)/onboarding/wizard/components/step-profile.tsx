"use client";

import type { ReactNode } from "react";

import { observer } from "mobx-react-lite";
import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { ArrowRight, Loader2 } from "lucide-react";

import { FormCheckbox } from "@/components/forms/form-checkbox";
import { AppForm } from "@/components/forms/form-context";
import { FormSelect } from "@/components/forms/form-select";
import { FormInput } from "@/components/forms/form-input";
import { AppLink } from "@/components/shared/app-link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useRootStore } from "@/core/stores/root-store.provider";
import { cn } from "@/core/utils/cn";
import { Alert } from "@/components/shared/alert";
import { WORKSPACE_NAME_MAX_LENGTH } from "@/features/workspace/workspace.schema";
import { Locale } from "@/generated/prisma";
import { DISPLAY_LANGUAGE_VALUES } from "@/i18n/user-locale";
import { appLocaleOrDefault } from "@/i18n/locale-registry";
import { SelectableCard } from "@/components/forms/selectable-card";
import { RadioGroup } from "@/components/ui/radio-group";
import { TEAM_SIZES, type TeamSize } from "@/features/onboarding-funnel/team-size";
import {
  DISCOVERY_CHOICES,
  DISCOVERY_DETAIL_MAX_LENGTH,
  type DiscoveryChoice,
} from "@/features/onboarding-funnel/discovery-answer";

type Props = {
  email: string;
  firstName?: string;
  lastName?: string;
  avatarUrl?: string;
  onboardingIntent?: string;
  inviterName?: string;
  isInvited?: boolean;
  canNameWorkspace?: boolean;
};

export const StepProfile = observer(
  ({
    email,
    firstName,
    lastName,
    avatarUrl,
    onboardingIntent,
    inviterName,
    isInvited = false,
    canNameWorkspace = false,
  }: Props) => {
    const t = useTranslations();
    const displayLanguage = appLocaleOrDefault(useLocale());
    const { stepProfileStore: store, appMode } = useRootStore();
    useState(() => {
      store.onInitOrRefresh({ email, firstName, lastName, avatarUrl, onboardingIntent, displayLanguage });
      store.setWithUnsavedChangesGuard(false);
    });
    const { isLoading } = store;
    const asksOwnerQuestions = appMode === "cloud" && !isInvited;
    const teamSizeLabels: Record<TeamSize, string> = {
      solo: t("OnboardingWizard.profile.teamSize.solo"),
      small: t("OnboardingWizard.profile.teamSize.small"),
      medium: t("OnboardingWizard.profile.teamSize.medium"),
      large: t("OnboardingWizard.profile.teamSize.large"),
    };
    const discoveryLabels: Record<DiscoveryChoice, string> = {
      searchEngine: t("OnboardingWizard.source.choices.searchEngine"),
      advertisement: t("OnboardingWizard.source.choices.advertisement"),
      aiAssistant: t("OnboardingWizard.source.choices.aiAssistant"),
      directory: t("OnboardingWizard.source.choices.directory"),
      socialMedia: t("OnboardingWizard.source.choices.socialMedia"),
      recommendation: t("OnboardingWizard.source.choices.recommendation"),
      articleOrVideo: t("OnboardingWizard.source.choices.articleOrVideo"),
      other: t("OnboardingWizard.source.choices.other"),
    };

    useEffect(() => store.setOwnerQuestions(asksOwnerQuestions), [asksOwnerQuestions, store]);

    useEffect(
      () => store.onInitOrRefresh({ email, firstName, lastName, avatarUrl, onboardingIntent, displayLanguage }),
      [avatarUrl, displayLanguage, email, firstName, lastName, onboardingIntent, store],
    );

    const displayLanguageItems = DISPLAY_LANGUAGE_VALUES.map((key) => ({
      value: key,
      label: key === Locale.system ? t("Common.locales.system") : t(`Common.locales.${key}`),
    }));
    const languageLabel =
      displayLanguageItems.find((item) => item.value === store.form.displayLanguage)?.label ??
      t("Common.locales.system");

    const legalDocumentLinks = {
      dataPrivacyLink: (chunks: ReactNode) => (
        <AppLink inheritSize appearance="inline" href="/privacy" target="_blank">
          {chunks}
        </AppLink>
      ),
      dpaLink: (chunks: ReactNode) => (
        <AppLink inheritSize appearance="inline" href="/dpa" target="_blank">
          {chunks}
        </AppLink>
      ),
      termsOfServiceLink: (chunks: ReactNode) => (
        <AppLink inheritSize appearance="inline" href="/terms" target="_blank">
          {chunks}
        </AppLink>
      ),
    };

    return (
      <AppForm store={store}>
        <div className="flex flex-col gap-4">
          {isInvited && inviterName ? (
            <Alert role="note">
              <p className="text-x-sm">{t("OnboardingForm.invitationFrom", { inviterName })}</p>
            </Alert>
          ) : null}

          <div className="grid w-full grid-cols-2 gap-3">
            <FormInput required autoComplete="given-name" id="firstName" name="given-name" />

            <FormInput required autoComplete="family-name" id="lastName" name="family-name" />
          </div>

          {canNameWorkspace ? (
            <FormInput
              autoComplete="organization"
              id="workspaceName"
              label={t("Workspaces.nameLabel")}
              maxLength={WORKSPACE_NAME_MAX_LENGTH}
              name="organization"
              placeholder={t("WorkspaceOnboarding.workspaceNamePlaceholder")}
            />
          ) : null}

          {asksOwnerQuestions ? (
            <fieldset className="flex flex-col gap-2" id="onboarding-team-size">
              <legend
                className={cn(
                  "mb-2 text-xs font-normal text-muted-foreground",
                  store.teamSizeMissing && "text-destructive",
                )}
              >
                {t("OnboardingWizard.profile.teamSize.label")}

                <span aria-hidden="true" className="text-destructive">
                  {" *"}
                </span>
              </legend>

              <RadioGroup
                aria-label={t("OnboardingWizard.profile.teamSize.label")}
                aria-required="true"
                className="grid grid-cols-2 gap-2 sm:grid-cols-4"
                disabled={isLoading}
                value={store.form.teamSize ?? ""}
                onValueChange={store.setTeamSize}
              >
                {TEAM_SIZES.map((size) => (
                  <SelectableCard
                    key={size}
                    centeredControl
                    disabled={isLoading}
                    id={`onboarding-team-size-${size}`}
                    label={teamSizeLabels[size]}
                    labelClassName="min-h-11 justify-center"
                    selectionMode="single"
                    value={size}
                  />
                ))}
              </RadioGroup>

              {store.teamSizeMissing ? (
                <p className="text-xs text-destructive" id="onboarding-team-size-error" role="alert">
                  {t("OnboardingWizard.profile.teamSize.required")}
                </p>
              ) : null}
            </fieldset>
          ) : null}

          {asksOwnerQuestions ? (
            <div className="flex flex-col gap-2">
              <Select disabled={isLoading} value={store.discovery ?? ""} onValueChange={store.setDiscovery}>
                <SelectTrigger
                  aria-label={t("OnboardingWizard.source.optionsLabel")}
                  className="h-11 w-full"
                  id="onboarding-source"
                >
                  <SelectValue placeholder={t("OnboardingWizard.profile.discovery")} />
                </SelectTrigger>

                <SelectContent>
                  {DISCOVERY_CHOICES.map((choice) => (
                    <SelectItem key={choice} id={`onboarding-source-${choice}`} value={choice}>
                      {discoveryLabels[choice]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {store.discovery === "other" ? (
                <Input
                  aria-label={t("OnboardingWizard.source.detailLabel")}
                  disabled={isLoading}
                  id="onboarding-source-detail"
                  maxLength={DISCOVERY_DETAIL_MAX_LENGTH}
                  placeholder={t("OnboardingWizard.source.detailPlaceholder")}
                  value={store.discoveryDetail}
                  onChange={(event) => store.setDiscoveryDetail(event.target.value)}
                />
              ) : null}
            </div>
          ) : null}

          {store.languageOpen ? (
            <FormSelect
              required
              id="displayLanguage"
              items={displayLanguageItems}
              label={t("Common.inputs.displayLanguage")}
            />
          ) : null}

          {appMode === "cloud" ? (
            <FormCheckbox
              required
              id="agreeToTerms"
              label={t.rich(
                isInvited ? "OnboardingForm.invitedAgreeToTerms" : "OnboardingForm.agreeToTerms",
                legalDocumentLinks,
              )}
            />
          ) : null}

          <div className="mt-2 flex flex-wrap items-center justify-between gap-3 max-sm:flex-col-reverse max-sm:items-stretch">
            {store.languageOpen ? (
              <span />
            ) : (
              <p className="flex items-center gap-1 text-xs text-muted-foreground">
                <span>{t("OnboardingWizard.profile.languageFromBrowser", { language: languageLabel })}</span>

                <Button
                  className="h-auto px-1 py-0.5 text-xs"
                  disabled={isLoading}
                  id="onboarding-language-change"
                  size="sm"
                  type="button"
                  variant="link"
                  onClick={store.openLanguage}
                >
                  {t("OnboardingWizard.change")}
                </Button>
              </p>
            )}

            <Button className="min-h-11" disabled={isLoading} id="onboarding-profile-continue" type="submit">
              {isLoading && <Loader2 className="size-4 animate-spin" />}

              {t("OnboardingWizard.continue")}

              {isLoading ? null : <ArrowRight aria-hidden="true" className="size-4" />}
            </Button>
          </div>
        </div>
      </AppForm>
    );
  },
);
