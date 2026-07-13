"use client";

import { useTranslations } from "next-intl";
import { observer } from "mobx-react-lite";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { useEffect } from "react";

import SignInProviderButton from "../signin/sign-in-provider-button";
import { continueWithGoogleAction, continueWithMicrosoftAction } from "../actions";
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

type Props = {
  isInvited: boolean;
  socialProviders: { google: boolean; microsoft: boolean };
};

export const SignUpForm = observer(({ isInvited, socialProviders }: Props) => {
  const t = useTranslations();
  const { signUpStore } = useRootStore();
  const { isLoading, form } = signUpStore;

  useEffect(() => {
    signUpStore.setWithUnsavedChangesGuard(false);
  }, []);

  return (
    <AppForm store={signUpStore}>
      <AppCard className="max-w-lg">
        <CardHeroHeader
          subtitle={t.rich("SignUpForm.switchToSignIn", {
            signInLink: (chunks) => (
              <AppLink inheritSize href="/auth/signin">
                {chunks}
              </AppLink>
            ),
          })}
          title={isInvited ? t("SignUpForm.inviteTitle") : t("SignUpForm.title")}
        />

        <AppCardBody>
          <SocialErrorToast />

          {isInvited ? (
            <Alert className="mb-4" color="success">
              <p className="text-x-sm">{t("SignUpForm.inviteSubtitle")}</p>
            </Alert>
          ) : (
            <Alert className="mb-4" color="primary">
              <p className="text-x-sm">{t("SignUpForm.newCompanySubtitle")}</p>
            </Alert>
          )}

          {(socialProviders.google || socialProviders.microsoft) && (
            <>
              <div className="flex flex-col items-center gap-4 sm:flex-row">
                {socialProviders.google && (
                  <SignInProviderButton
                    className="w-full sm:flex-1"
                    label={t("SignUpForm.buttonLabel", { provider: "Google" })}
                    providerId="google"
                    onClick={() =>
                      void continueWithGoogleAction(undefined, "/auth/signup").then((res) => {
                        if (res.data.url) window.location.assign(res.data.url);
                      })
                    }
                  />
                )}

                {socialProviders.microsoft && (
                  <SignInProviderButton
                    className="w-full sm:flex-1"
                    label={t("SignUpForm.buttonLabel", {
                      provider: "Microsoft",
                    })}
                    providerId="microsoft"
                    onClick={() =>
                      void continueWithMicrosoftAction(undefined, "/auth/signup").then((res) => {
                        if (res.data.url) window.location.assign(res.data.url);
                      })
                    }
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

            <p className="text-x-xs text-subdued text-center mt-2">
              {t.rich("SignUpForm.agreeToTerms", {
                dataPrivacyLink: (chunks) => (
                  <AppLink inheritSize className="text-inherit underline" href="/privacy" target="_blank">
                    {chunks}
                  </AppLink>
                ),
                termsOfServiceLink: (chunks) => (
                  <AppLink inheritSize className="text-inherit underline" href="/terms" target="_blank">
                    {chunks}
                  </AppLink>
                ),
              })}
            </p>
          </div>
        </AppCardFooter>
      </AppCard>
    </AppForm>
  );
});
