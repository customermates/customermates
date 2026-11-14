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
import { useRootStore } from "@/core/stores/root-store.provider";
import { Alert } from "@/components/shared/alert";
import { WORKSPACE_NAME_MAX_LENGTH } from "@/features/workspace/workspace.schema";
import { Locale } from "@/generated/prisma";
import { DISPLAY_LANGUAGE_VALUES } from "@/i18n/user-locale";
import { appLocaleOrDefault } from "@/i18n/locale-registry";
import { SelectableCard } from "@/components/forms/selectable-card";
import { RadioGroup } from "@/components/ui/radio-group";
import { TEAM_SIZES, type TeamSize } from "@/features/onboarding-funnel/team-size";

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
    const asksTeamSize = appMode === "cloud" && !isInvited;
    const teamSizeLabels: Record<TeamSize, string> = {
      solo: t("OnboardingWizard.profile.teamSize.solo"),
      small: t("OnboardingWizard.profile.teamSize.small"),
      medium: t("OnboardingWizard.profile.teamSize.medium"),
      large: t("OnboardingWizard.profile.teamSize.large"),
    };

    useEffect(() => store.setRequiresTeamSize(asksTeamSize), [asksTeamSize, store]);

    useEffect(
      () => store.onInitOrRefresh({ email, firstName, lastName, avatarUrl, onboardingIntent, displayLanguage }),
      [avatarUrl, displayLanguage, email, firstName, lastName, onboardingIntent, store],
    );

    const displayLanguageItems = DISPLAY_LANGUAGE_VALUES.map((key) => ({
      value: key,
      label: key === Locale.system ? t("Common.locales.system") : t(`Common.locales.${key}`),
    }));

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
        <div className="flex flex-col gap-3">
          {isInvited && inviterName ? (
            <Alert role="note">
              <p className="text-x-sm">{t("OnboardingForm.invitationFrom", { inviterName })}</p>
            </Alert>
          ) : null}

          <div className="grid w-full grid-cols-2 gap-3">
            <FormInput required autoComplete="given-name" id="firstName" name="given-name" />

            <FormInput required autoComplete="family-name" id="lastName" name="family-name" />
          </div>

          <FormSelect
            required
            id="displayLanguage"
            items={displayLanguageItems}
            label={t("Common.inputs.displayLanguage")}
          />

          {canNameWorkspace ? (
            <FormInput
              autoComplete="organization"
              description={t("WorkspaceOnboarding.workspaceNameDescription")}
              id="workspaceName"
              label={t("Workspaces.nameLabel")}
              maxLength={WORKSPACE_NAME_MAX_LENGTH}
              name="organization"
              placeholder={t("WorkspaceOnboarding.workspaceNamePlaceholder")}
            />
          ) : null}

          {asksTeamSize ? (
            <fieldset className="flex flex-col gap-2" id="onboarding-team-size">
              <legend className="mb-2 text-sm font-medium">
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
                    disabled={isLoading}
                    id={`onboarding-team-size-${size}`}
                    label={teamSizeLabels[size]}
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

          <Button className="mt-2 self-end max-sm:self-stretch" disabled={isLoading} type="submit">
            {isLoading && <Loader2 className="size-4 animate-spin" />}

            {t("OnboardingWizard.next")}

            {isLoading ? null : <ArrowRight aria-hidden="true" className="size-4" />}
          </Button>
        </div>
      </AppForm>
    );
  },
);
