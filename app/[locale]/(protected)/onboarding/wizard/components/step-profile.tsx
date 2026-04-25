"use client";

import { observer } from "mobx-react-lite";
import { useEffect } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
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
};

function initialsFromName(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export const StepProfile = observer(({ email, firstName, lastName, avatarUrl }: Props) => {
  const t = useTranslations("");
  const { stepProfileStore: store } = useRootStore();
  const { form, isLoading } = store;

  useEffect(
    () => store.onInitOrRefresh({ email, firstName, lastName, avatarUrl }),
    [email, firstName, lastName, avatarUrl],
  );

  useEffect(() => {
    store.setWithUnsavedChangesGuard(false);
  }, []);

  return (
    <AppForm store={store}>
      <div className="flex flex-col gap-3">
        <FormInput readOnly id="email" type="email" />

        <div className="grid w-full grid-cols-1 gap-3 sm:grid-cols-2">
          <FormInput required id="firstName" />

          <FormInput required id="lastName" />
        </div>

        <FormAutocompleteCountry required id="country" />

        <div className="flex w-full items-start gap-3">
          <FormInput
            containerClassName="flex-1 min-w-0"
            description={t("OnboardingWizard.avatarDescription")}
            id="avatarUrl"
          />

          <Avatar className="size-9 shrink-0 border mt-5.5">
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

        <Button className="self-end mt-2" disabled={isLoading} type="submit">
          {isLoading && <Loader2 className="size-4 animate-spin" />}

          {t("OnboardingWizard.continue")}
        </Button>
      </div>
    </AppForm>
  );
});
