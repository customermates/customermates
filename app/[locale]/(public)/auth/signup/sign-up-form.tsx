"use client";

import { useTranslations } from "next-intl";
import { observer } from "mobx-react-lite";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { useEffect, useState } from "react";

import SignInProviderButton from "../signin/sign-in-provider-button";
import { SocialErrorToast } from "../social-error-toast";

import { AppLink } from "@/components/shared/app-link";
import { AppForm } from "@/components/forms/form-context";
import { FormInput } from "@/components/forms/form-input";
import { PasswordInput } from "@/components/forms/password-input";
import { useRootStore } from "@/core/stores/root-store.provider";
import { Alert } from "@/components/shared/alert";
import { AppCard } from "@/components/card/app-card";
import { AppCardBody } from "@/components/card/app-card-body";
import { AppCardFooter } from "@/components/card/app-card-footer";
import { CardHeroHeader } from "@/components/card/card-hero-header";
import { Reveal } from "@/components/shared/reveal";
import { runUserAction } from "@/core/errors/report-application-error";
import { pathWithOnboardingIntent } from "@/features/company/onboarding-intent-url";

type Props = {
  invitationIntent?: string;
  inviterName?: string;
  socialProviders: { google: boolean; microsoft: boolean };
};

export const SignUpForm = observer(({ invitationIntent, inviterName, socialProviders }: Props) => {
  const t = useTranslations();
  const { signUpStore, appMode } = useRootStore();
  useState(() => {
    signUpStore.setInvitationIntent(invitationIntent);
    signUpStore.setWithUnsavedChangesGuard(false);
  });
  const { isLoading, form } = signUpStore;
  const isInvited = Boolean(invitationIntent && inviterName);

  useEffect(() => {
    signUpStore.setInvitationIntent(invitationIntent);
  }, [invitationIntent, signUpStore]);

  return (
    <AppForm store={signUpStore}>
      <AppCard className="max-w-lg">
        <CardHeroHeader
          alt=""
          subtitle={t.rich("SignUpForm.switchToSignIn", {
            signInLink: (chunks) => (
              <AppLink
                inheritSize
                appearance="inline"
                href={invitationIntent ? pathWithOnboardingIntent("/auth/signin", invitationIntent) : "/auth/signin"}
              >
                {chunks}
              </AppLink>
            ),
          })}
          title={isInvited ? t("SignUpForm.inviteTitle") : t("SignUpForm.title")}
        />

        <AppCardBody>
          <SocialErrorToast />

          {isInvited ? (
            <Alert className="mb-4" role="note">
              <p className="text-x-sm">{t("SignUpForm.inviteSubtitle", { inviterName: inviterName ?? "" })}</p>
            </Alert>
          ) : appMode === "cloud" ? (
            <Alert className="mb-4" color="primary">
              <p className="text-x-sm">{t("SignUpForm.accountSubtitle")}</p>
            </Alert>
          ) : null}

          {(socialProviders.google || socialProviders.microsoft) && (
            <>
              <div className="flex flex-col items-center gap-4 sm:flex-row">
                {socialProviders.google && (
                  <SignInProviderButton
                    className="w-full sm:flex-1"
                    isLoading={isLoading}
                    label={t("SignUpForm.buttonLabel", { provider: "Google" })}
                    providerId="google"
                    onClick={() => runUserAction(() => signUpStore.continueWithProvider("google"))}
                  />
                )}

                {socialProviders.microsoft && (
                  <SignInProviderButton
                    className="w-full sm:flex-1"
                    isLoading={isLoading}
                    label={t("SignUpForm.buttonLabel", {
                      provider: "Microsoft",
                    })}
                    providerId="microsoft"
                    onClick={() => runUserAction(() => signUpStore.continueWithProvider("microsoft"))}
                  />
                )}
              </div>

              <div className="my-3 flex items-center">
                <Separator aria-hidden="true" className="h-px flex-1" />

                <span className="text-x-sm text-subdued mx-4">{t("SignUpForm.or")}</span>

                <Separator aria-hidden="true" className="h-px flex-1" />
              </div>
            </>
          )}

          <FormInput required id="email" type="email" />

          <Reveal show={Boolean(form.email?.trim())}>
            <FormInput required id="confirmEmail" type="email" />
          </Reveal>

          <PasswordInput
            required
            id="password"
            showPassword={signUpStore.showPassword}
            onToggleVisibility={signUpStore.toggleShowPassword}
          />

          <FormInput required id="confirmPassword" type={signUpStore.showPassword ? "text" : "password"} />
        </AppCardBody>

        <AppCardFooter>
          <div className="flex w-full flex-col space-y-3 items-center">
            <Button className="w-full" disabled={isLoading} type="submit">
              {isInvited ? t("SignUpForm.acceptInviteCta") : t("SignUpForm.signUpCta")}
            </Button>

            {appMode === "cloud" && !isInvited ? (
              <p className="text-x-xs text-subdued text-center mt-2 max-w-sm">
                {t.rich("SignUpForm.agreeToTerms", {
                  dataPrivacyLink: (chunks) => (
                    <AppLink inheritSize appearance="inline" href="/privacy" target="_blank">
                      {chunks}
                    </AppLink>
                  ),
                  dpaLink: (chunks) => (
                    <AppLink inheritSize appearance="inline" href="/dpa" target="_blank">
                      {chunks}
                    </AppLink>
                  ),
                  termsOfServiceLink: (chunks) => (
                    <AppLink inheritSize appearance="inline" href="/terms" target="_blank">
                      {chunks}
                    </AppLink>
                  ),
                })}
              </p>
            ) : null}
          </div>
        </AppCardFooter>
      </AppCard>
    </AppForm>
  );
});
