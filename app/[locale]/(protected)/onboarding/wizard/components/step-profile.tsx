"use client";

import type { ReactNode } from "react";

import { observer } from "mobx-react-lite";
import { useEffect } from "react";
import { useTranslations } from "next-intl";
import { Loader2 } from "lucide-react";

import { FormCheckbox } from "@/components/forms/form-checkbox";
import { AppForm } from "@/components/forms/form-context";
import { FormAutocompleteCountry } from "@/components/forms/form-autocomplete-country";
import { FormInput } from "@/components/forms/form-input";
import { AppLink } from "@/components/shared/app-link";
import { Button } from "@/components/ui/button";
import { useRootStore } from "@/core/stores/root-store.provider";

type Props = {
  email: string;
  firstName?: string;
  lastName?: string;
  avatarUrl?: string;
  isInvited?: boolean;
};

export const StepProfile = observer(({ email, firstName, lastName, avatarUrl, isInvited = false }: Props) => {
  const t = useTranslations();
  const { stepProfileStore: store, appMode } = useRootStore();
  const { isLoading } = store;

  useEffect(
    () => store.onInitOrRefresh({ email, firstName, lastName, avatarUrl }),
    [email, firstName, lastName, avatarUrl],
  );

  useEffect(() => {
    store.setWithUnsavedChangesGuard(false);
  }, []);

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
        <FormInput readOnly autoComplete="email" id="email" name="email" type="email" />

        <div className="grid w-full grid-cols-1 gap-3 sm:grid-cols-2">
          <FormInput required autoComplete="given-name" id="firstName" name="given-name" />

          <FormInput required autoComplete="family-name" id="lastName" name="family-name" />
        </div>

        <FormAutocompleteCountry required id="country" />

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
});
