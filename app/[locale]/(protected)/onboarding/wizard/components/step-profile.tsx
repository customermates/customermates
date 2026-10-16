"use client";

import type { ReactNode } from "react";

import { observer } from "mobx-react-lite";
import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Loader2 } from "lucide-react";

import { FormCheckbox } from "@/components/forms/form-checkbox";
import { AppForm } from "@/components/forms/form-context";
import { FormSelect } from "@/components/forms/form-select";
import { FormInput } from "@/components/forms/form-input";
import { AppLink } from "@/components/shared/app-link";
import { Button } from "@/components/ui/button";
import { useRootStore } from "@/core/stores/root-store.provider";
import { Alert } from "@/components/shared/alert";
import { Locale } from "@/generated/prisma";
import { DISPLAY_LANGUAGE_VALUES } from "@/i18n/user-locale";
import { appLocaleOrDefault } from "@/i18n/locale-registry";

type Props = {
  email: string;
  firstName?: string;
  lastName?: string;
  avatarUrl?: string;
  onboardingIntent?: string;
  inviterName?: string;
  isInvited?: boolean;
};

export const StepProfile = observer(
  ({ email, firstName, lastName, avatarUrl, onboardingIntent, inviterName, isInvited = false }: Props) => {
    const t = useTranslations();
    const displayLanguage = appLocaleOrDefault(useLocale());
    const { stepProfileStore: store, appMode } = useRootStore();
    useState(() => {
      store.onInitOrRefresh({ email, firstName, lastName, avatarUrl, onboardingIntent, displayLanguage });
      store.setWithUnsavedChangesGuard(false);
    });
    const { isLoading } = store;

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

          <FormInput readOnly autoComplete="email" id="email" name="email" type="email" />

          <div className="grid w-full grid-cols-1 gap-3 sm:grid-cols-2">
            <FormInput required autoComplete="given-name" id="firstName" name="given-name" />

            <FormInput required autoComplete="family-name" id="lastName" name="family-name" />
          </div>

          <FormSelect
            required
            description={t("UserSettingsForm.displayLanguageHint")}
            id="displayLanguage"
            items={displayLanguageItems}
            label={t("Common.inputs.displayLanguage")}
          />

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

          <Button className="self-end mt-2" disabled={isLoading} type="submit">
            {isLoading && <Loader2 className="size-4 animate-spin" />}

            {t("OnboardingWizard.continue")}
          </Button>
        </div>
      </AppForm>
    );
  },
);
