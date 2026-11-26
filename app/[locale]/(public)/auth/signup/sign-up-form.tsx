"use client";

import { useTranslations } from "next-intl";
import { observer } from "mobx-react-lite";
import { useEffect, useState } from "react";

import { AuthMethodActions, AuthMethodTabs } from "@/app/[locale]/(entry)/auth/signin/auth-method-tabs";
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
import { pathWithOnboardingIntent } from "@/features/company/onboarding-intent-url";
import { serverRenderedClient } from "@/core/utils/server-rendered-client";
import type { SignupRequest } from "@/features/acquisition/signup-source";

type Props = {
  invitationIntent?: string;
  inviterName?: string;
  socialProviders: { google: boolean; microsoft: boolean };
  workspaceName?: string | null;
};

const SignUpFormContent = observer(({ invitationIntent, inviterName, socialProviders, workspaceName }: Props) => {
  const t = useTranslations();
  const { signUpStore, appMode } = useRootStore();
  useState(() => {
    signUpStore.onInitOrRefresh({ onboardingIntent: invitationIntent });
    signUpStore.setWithUnsavedChangesGuard(false);
  });
  const { isLoading, form } = signUpStore;
  const isInvited = Boolean(invitationIntent && inviterName);
  const workspace = workspaceName?.trim() ?? "";

  useEffect(() => {
    if (signUpStore.form.onboardingIntent !== invitationIntent)
      signUpStore.onInitOrRefresh({ onboardingIntent: invitationIntent });
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
              <p className="text-x-sm">
                {workspace
                  ? t("SignUpForm.inviteSubtitleNamed", { inviterName: inviterName ?? "", workspace })
                  : t("SignUpForm.inviteSubtitle", { inviterName: inviterName ?? "" })}
              </p>
            </Alert>
          ) : appMode === "cloud" ? (
            <Alert className="mb-4" variant="info">
              <p className="text-x-sm">{t("SignUpForm.accountSubtitle")}</p>
            </Alert>
          ) : null}

          <AuthMethodTabs
            isLoading={isLoading}
            password={
              <>
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
              </>
            }
            providerLabel={(provider) => t("SignUpForm.buttonLabel", { provider })}
            socialProviders={socialProviders}
            state={signUpStore.methods}
            onContinueWithProvider={signUpStore.continueWithProvider}
          />
        </AppCardBody>

        <AppCardFooter>
          <div className="flex w-full flex-col space-y-3 items-center">
            <AuthMethodActions
              isLoading={isLoading}
              magicLinkCta={t("AuthMethods.magicLink.signUpCta")}
              passwordCta={isInvited ? t("SignUpForm.acceptInviteCta") : t("SignUpForm.signUpCta")}
              socialProviders={socialProviders}
              state={signUpStore.methods}
              onResendMagicLink={signUpStore.requestMagicLink}
            />

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

function SignUpFormWithJourney({ signupJourney, ...props }: Props & { signupJourney?: SignupRequest }) {
  const { signUpStore } = useRootStore();
  useState(() => {
    if (signupJourney) signUpStore.setSignupJourney(signupJourney);
  });

  useEffect(() => {
    if (signupJourney || signUpStore.signupJourney) signUpStore.setSignupJourney(signupJourney ?? null);
  }, [signupJourney, signUpStore]);

  return <SignUpFormContent {...props} />;
}

export const SignUpForm = serverRenderedClient(SignUpFormWithJourney);
