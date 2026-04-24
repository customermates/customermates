"use client";

import { observer } from "mobx-react-lite";
import { useEffect } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useTranslations } from "next-intl";

import { FormCheckbox } from "@/components/forms/form-checkbox";
import { AppCard } from "@/components/card/app-card";
import { AppCardBody } from "@/components/card/app-card-body";
import { AppForm } from "@/components/forms/form-context";
import { FormAutocompleteCountry } from "@/components/forms/form-autocomplete-country";
import { FormInput } from "@/components/forms/form-input";
import { AppLink } from "@/components/shared/app-link";
import { FormActions } from "@/components/card/form-actions";
import { useRootStore } from "@/core/stores/root-store.provider";
import { CardHeroHeader } from "@/components/card/card-hero-header";

type Props = {
  email: string;
  firstName?: string;
  lastName?: string;
  avatarUrl?: string;
};

function initialsFromName(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export const OnboardingForm = observer(({ email, firstName, lastName, avatarUrl }: Props) => {
  const t = useTranslations("");

  const { onboardingStore } = useRootStore();
  const { form } = onboardingStore;

  useEffect(
    () => onboardingStore.onInitOrRefresh({ email, firstName, lastName, avatarUrl }),
    [email, firstName, lastName, avatarUrl],
  );

  useEffect(() => {
    onboardingStore.setWithUnsavedChangesGuard(false);
  }, []);

  return (
    <AppForm store={onboardingStore}>
      <AppCard className="max-w-lg">
        <CardHeroHeader subtitle={t("OnboardingForm.subtitle")} title={t("OnboardingForm.title")} />

        <AppCardBody>
          <FormInput readOnly id="email" type="email" />

          <div className="grid w-full grid-cols-1 gap-3 sm:grid-cols-2">
            <FormInput required id="firstName" />

            <FormInput required id="lastName" />
          </div>

          <FormAutocompleteCountry required id="country" />

          <div className="flex w-full items-end gap-3">
            <FormInput containerClassName="flex-1 min-w-0" id="avatarUrl" />

            <Avatar className="size-9 shrink-0 border">
              {form.avatarUrl && <AvatarImage alt="avatar" src={form.avatarUrl} />}

              <AvatarFallback className="text-xs">
                {initialsFromName(`${form.firstName} ${form.lastName}`)}
              </AvatarFallback>
            </Avatar>
          </div>

          <FormCheckbox
            required
            id="agreeToTerms"
            label={
              <span>
                {t.rich("OnboardingForm.agreeToTerms", {
                  dataPrivacyLink: (chunks) => (
                    <AppLink href="/privacy" target="_blank">
                      {chunks}
                    </AppLink>
                  ),
                  termsOfServiceLink: (chunks) => (
                    <AppLink href="/terms" target="_blank">
                      {chunks}
                    </AppLink>
                  ),
                })}
              </span>
            }
          />

          <FormCheckbox id="marketingEmails" label={t("UserSettingsForm.marketingEmails")} />
        </AppCardBody>

        <FormActions showInitially />
      </AppCard>
    </AppForm>
  );
});
