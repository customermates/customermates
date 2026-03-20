"use client";

import { observer } from "mobx-react-lite";
import { useEffect } from "react";
import { Avatar } from "@heroui/avatar";
import { useTranslations } from "next-intl";

import { XCheckbox } from "@/components/x-inputs/x-checkbox";
import { XCard } from "@/components/x-card/x-card";
import { XCardBody } from "@/components/x-card/x-card-body";
import { XForm } from "@/components/x-inputs/x-form";
import { XAutocompleteCountry } from "@/components/x-inputs/x-autocomplete/x-autocomplete-country";
import { XInput } from "@/components/x-inputs/x-input";
import { XLink } from "@/components/x-link";
import { XCardFormFooter } from "@/components/x-card/x-card-form-footer";
import { useRootStore } from "@/core/stores/root-store.provider";
import { XCardHeroHeader } from "@/components/x-card/x-card-hero-header";

type Props = {
  email: string;
  firstName?: string;
  lastName?: string;
  avatarUrl?: string;
};

export const OnboardingCard = observer(({ email, firstName, lastName, avatarUrl }: Props) => {
  const t = useTranslations("");

  const { onboardingCardStore } = useRootStore();
  const { form } = onboardingCardStore;

  useEffect(
    () => onboardingCardStore.onInitOrRefresh({ email, firstName, lastName, avatarUrl }),
    [email, firstName, lastName, avatarUrl],
  );

  useEffect(() => {
    onboardingCardStore.setWithUnsavedChangesGuard(false);
  }, []);

  return (
    <XForm store={onboardingCardStore}>
      <XCard className="max-w-lg">
        <XCardHeroHeader subtitle={t("OnboardingCard.subtitle")} title={t("OnboardingCard.title")} />

        <XCardBody>
          <XInput isDisabled id="email" type="email" />

          <div className="grid w-full grid-cols-1 gap-3 sm:grid-cols-2">
            <XInput isRequired id="firstName" />

            <XInput isRequired id="lastName" />
          </div>

          <XAutocompleteCountry isRequired allowsEmptyCollection={false} id="country" />

          <div className="flex w-full gap-3 items-center justify-start">
            <XInput description={t("Common.avatarUrlDescription")} id="avatarUrl" />

            <Avatar
              isBordered
              showFallback
              className="min-h-14 min-w-14"
              name={`${form.firstName} ${form.lastName}`.trim()}
              size="lg"
              src={form.avatarUrl ?? undefined}
            />
          </div>

          <XCheckbox isRequired id="agreeToTerms">
            {t.rich("OnboardingCard.agreeToTerms", {
              dataPrivacyLink: (chunks) => (
                <XLink href="/privacy" target="_blank">
                  {chunks}
                </XLink>
              ),
              termsOfServiceLink: (chunks) => (
                <XLink href="/terms" target="_blank">
                  {chunks}
                </XLink>
              ),
            })}
            *
          </XCheckbox>

          <XCheckbox id="marketingEmails">{t("UserSettingsCard.marketingEmails")}</XCheckbox>
        </XCardBody>

        <XCardFormFooter showInitially />
      </XCard>
    </XForm>
  );
});
