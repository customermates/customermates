"use client";

import { useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { observer } from "mobx-react-lite";
import { Button } from "@/components/ui/button";
import { useEffect, useState } from "react";

import { AppForm } from "@/components/forms/form-context";
import { FormInput } from "@/components/forms/form-input";
import { AppCard } from "@/components/card/app-card";
import { AppCardBody } from "@/components/card/app-card-body";
import { AppLink } from "@/components/shared/app-link";
import { useRootStore } from "@/core/stores/root-store.provider";
import { Alert } from "@/components/shared/alert";
import { AppCardFooter } from "@/components/card/app-card-footer";
import { CardHeroHeader } from "@/components/card/card-hero-header";
import { Reveal } from "@/components/shared/reveal";
import { pathWithOnboardingIntent } from "@/features/company/onboarding-intent-url";

type Props = {
  inviterName?: string;
  onboardingIntent?: string;
};

export const ForgotPasswordForm = observer(({ inviterName, onboardingIntent }: Props) => {
  const t = useTranslations();

  const searchParams = useSearchParams();
  const info = searchParams.get("info");

  const { forgotPasswordStore } = useRootStore();
  useState(() => {
    forgotPasswordStore.onInitOrRefresh({ onboardingIntent });
    forgotPasswordStore.setWithUnsavedChangesGuard(false);
  });
  const { form, isLoading } = forgotPasswordStore;

  useEffect(() => {
    if (forgotPasswordStore.form.onboardingIntent !== onboardingIntent)
      forgotPasswordStore.onInitOrRefresh({ onboardingIntent });
  }, [forgotPasswordStore, onboardingIntent]);

  return (
    <AppForm store={forgotPasswordStore}>
      <AppCard className="max-w-md">
        <CardHeroHeader
          alt=""
          subtitle={t.rich("ForgotPasswordForm.backToSignIn", {
            backToSignInLink: (chunks) => (
              <AppLink
                inheritSize
                appearance="inline"
                href={onboardingIntent ? pathWithOnboardingIntent("/auth/signin", onboardingIntent) : "/auth/signin"}
              >
                {chunks}
              </AppLink>
            ),
          })}
          title={t("ForgotPasswordForm.title")}
        />

        <AppCardBody>
          {inviterName ? (
            <Alert className="mb-4" role="note">
              <p className="text-x-sm">{t("InvitationCard.inviter", { inviterName })}</p>
            </Alert>
          ) : null}

          {info === "RESET_LINK_INVALID" && (
            <Alert className="mb-4" color="warning">
              <p className="text-x-sm">{t("ForgotPasswordForm.resetLinkInvalid")}</p>
            </Alert>
          )}

          <FormInput required id="email" type="email" />

          <Reveal show={Boolean(form.email?.trim())}>
            <FormInput required id="confirmEmail" type="email" />
          </Reveal>
        </AppCardBody>

        <AppCardFooter>
          <Button className="w-full" disabled={isLoading} type="submit">
            {t("ForgotPasswordForm.sendCta")}
          </Button>
        </AppCardFooter>
      </AppCard>
    </AppForm>
  );
});
