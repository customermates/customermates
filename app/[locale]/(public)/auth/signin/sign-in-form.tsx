"use client";
import { useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { observer } from "mobx-react-lite";
import { useEffect } from "react";

import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";

import { continueWithGoogleAction, continueWithMicrosoftAction } from "../actions";

import SignInProviderButton from "./sign-in-provider-button";

import { SocialErrorToast } from "../social-error-toast";

import { AppLink } from "@/components/shared/app-link";
import { FormInput } from "@/components/forms/form-input";
import { PasswordInput } from "@/components/forms/password-input";
import { useRootStore } from "@/core/stores/root-store.provider";
import { AppForm } from "@/components/forms/form-context";
import { FormCheckbox } from "@/components/forms/form-checkbox";
import { AppCard } from "@/components/card/app-card";
import { AppCardBody } from "@/components/card/app-card-body";
import { AppCardFooter } from "@/components/card/app-card-footer";
import { CardHeroHeader } from "@/components/card/card-hero-header";

type Props = {
  isInvited: boolean;
  socialProviders: { google: boolean; microsoft: boolean };
};

export const SignInForm = observer(({ isInvited, socialProviders }: Props) => {
  const searchParams = useSearchParams();

  const t = useTranslations();

  const { signInStore, appMode } = useRootStore();
  const { callbackURL, isLoading } = signInStore;

  useEffect(() => {
    signInStore.setCallbackURL(searchParams.get("callbackURL") ?? undefined);
  }, [searchParams]);

  useEffect(() => {
    signInStore.setWithUnsavedChangesGuard(false);
  }, []);

  return (
    <AppForm store={signInStore}>
      <AppCard className="max-w-lg">
        <CardHeroHeader
          subtitle={t.rich("SignInForm.switchToSignUp", {
            registerLink: (chunks) => (
              <AppLink inheritSize appearance="inline" href="/auth/signup">
                {chunks}
              </AppLink>
            ),
          })}
          title={t("SignInForm.signInTitle")}
        />

        <AppCardBody>
          <SocialErrorToast />

          {(socialProviders.google || socialProviders.microsoft) && (
            <>
              <div className="flex flex-col items-center gap-4 sm:flex-row">
                {socialProviders.google && (
                  <SignInProviderButton
                    className="w-full sm:flex-1"
                    label={t("SignInForm.buttonLabel", { provider: "Google" })}
                    providerId="google"
                    onClick={() =>
                      void continueWithGoogleAction(callbackURL, "/auth/signin").then((res) => {
                        if (res.data.url) window.location.assign(res.data.url);
                      })
                    }
                  />
                )}

                {socialProviders.microsoft && (
                  <SignInProviderButton
                    className="w-full sm:flex-1"
                    label={t("SignInForm.buttonLabel", {
                      provider: "Microsoft",
                    })}
                    providerId="microsoft"
                    onClick={() =>
                      void continueWithMicrosoftAction(callbackURL, "/auth/signin").then((res) => {
                        if (res.data.url) window.location.assign(res.data.url);
                      })
                    }
                  />
                )}
              </div>

              <div className="my-3 flex items-center">
                <Separator aria-hidden="true" className="h-px flex-1" />

                <span className="text-x-sm text-subdued mx-4">{t("SignInForm.or")}</span>

                <Separator aria-hidden="true" className="h-px flex-1" />
              </div>
            </>
          )}

          <FormInput required id="email" type="email" />

          <PasswordInput
            required
            id="password"
            showPassword={signInStore.showPassword}
            onToggleVisibility={signInStore.toggleShowPassword}
          />

          <div className="flex w-full justify-between items-start gap-3">
            <FormCheckbox id="rememberMe" label={t("SignInForm.rememberMe")} />

            <AppLink href="/auth/forgot-password">{t("SignInForm.forgotPassword")}</AppLink>
          </div>
        </AppCardBody>

        <AppCardFooter>
          <div className="flex w-full flex-col space-y-3 items-center">
            <Button className="w-full" disabled={isLoading} type="submit">
              {t("SignInForm.signInCta")}
            </Button>

            {appMode === "cloud" && !isInvited ? (
              <p className="text-x-xs text-subdued text-center mt-2">
                {t.rich("SignInForm.agreeToTerms", {
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
