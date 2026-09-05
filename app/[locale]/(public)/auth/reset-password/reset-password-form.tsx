"use client";

import { useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { observer } from "mobx-react-lite";
import { Button } from "@/components/ui/button";
import { useEffect, useState } from "react";

import { useRootStore } from "@/core/stores/root-store.provider";
import { AppCard } from "@/components/card/app-card";
import { AppCardBody } from "@/components/card/app-card-body";
import { AppCardFooter } from "@/components/card/app-card-footer";
import { CardHeroHeader } from "@/components/card/card-hero-header";
import { AppForm } from "@/components/forms/form-context";
import { FormInput } from "@/components/forms/form-input";
import { PasswordInput } from "@/components/forms/password-input";
import { AppLink } from "@/components/shared/app-link";
import { Alert } from "@/components/shared/alert";
import { pathWithOnboardingIntent } from "@/features/company/onboarding-intent-url";

type Props = {
  inviterName?: string;
  onboardingIntent?: string;
};

export const ResetPasswordForm = observer(({ inviterName, onboardingIntent }: Props) => {
  const t = useTranslations();
  const { resetPasswordStore } = useRootStore();
  const searchParams = useSearchParams();
  const token = searchParams.get("token") ?? "";
  useState(() => {
    resetPasswordStore.onInitOrRefresh({ confirmPassword: "", password: "", token, onboardingIntent });
    resetPasswordStore.setWithUnsavedChangesGuard(false);
  });
  const { isLoading, showPassword } = resetPasswordStore;

  useEffect(() => {
    if (resetPasswordStore.form.token !== token)
      resetPasswordStore.onInitOrRefresh({ confirmPassword: "", password: "", token, onboardingIntent });
    else if (resetPasswordStore.form.onboardingIntent !== onboardingIntent)
      resetPasswordStore.onInitOrRefresh({ token, onboardingIntent });
  }, [onboardingIntent, resetPasswordStore, token]);

  return (
    <AppForm store={resetPasswordStore}>
      <AppCard className="max-w-md">
        <CardHeroHeader
          alt=""
          subtitle={t.rich("ResetPasswordForm.backToSignIn", {
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
          title={t("ResetPasswordForm.title")}
        />

        <AppCardBody>
          {inviterName ? (
            <Alert className="mb-4" role="note">
              <p className="text-x-sm">{t("InvitationCard.inviter", { inviterName })}</p>
            </Alert>
          ) : null}

          <PasswordInput
            required
            id="password"
            showPassword={showPassword}
            onToggleVisibility={resetPasswordStore.toggleShowPassword}
          />

          <FormInput required id="confirmPassword" type={showPassword ? "text" : "password"} />
        </AppCardBody>

        <AppCardFooter>
          <Button className="w-full" disabled={isLoading} type="submit">
            {t("ResetPasswordForm.resetPasswordCta")}
          </Button>
        </AppCardFooter>
      </AppCard>
    </AppForm>
  );
});
