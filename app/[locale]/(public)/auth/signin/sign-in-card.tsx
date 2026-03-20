"use client";
import { useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { observer } from "mobx-react-lite";
import { useEffect } from "react";
import { Button } from "@heroui/button";
import { Divider } from "@heroui/divider";
import { EyeIcon, EyeSlashIcon } from "@heroicons/react/24/outline";

import { continueWithGoogleAction, continueWithMicrosoftAction } from "../actions";

import SignInProviderButton from "./sign-in-provider-button";

import { XLink } from "@/components/x-link";
import { XInput } from "@/components/x-inputs/x-input";
import { useRootStore } from "@/core/stores/root-store.provider";
import { XForm } from "@/components/x-inputs/x-form";
import { XCheckbox } from "@/components/x-inputs/x-checkbox";
import { XIcon } from "@/components/x-icon";
import { XCard } from "@/components/x-card/x-card";
import { XCardBody } from "@/components/x-card/x-card-body";
import { XCardFooter } from "@/components/x-card/x-card-footer";
import { XCardHeroHeader } from "@/components/x-card/x-card-hero-header";

type Props = {
  showSocialProviders: boolean;
};

export const SignInCard = observer(({ showSocialProviders }: Props) => {
  const searchParams = useSearchParams();

  const t = useTranslations("SignInCard");

  const { signInCardStore } = useRootStore();
  const { callbackURL, isLoading } = signInCardStore;

  useEffect(() => {
    signInCardStore.setCallbackURL(searchParams.get("callbackURL") ?? undefined);
  }, [searchParams]);

  useEffect(() => {
    signInCardStore.setWithUnsavedChangesGuard(false);
  }, []);

  return (
    <XForm store={signInCardStore}>
      <XCard className="max-w-lg">
        <XCardHeroHeader
          subtitle={t.rich("switchToSignUp", {
            registerLink: (chunks) => (
              <XLink inheritSize href="/auth/signup">
                {chunks}
              </XLink>
            ),
          })}
          title={t("signInTitle")}
        />

        <XCardBody>
          {showSocialProviders && (
            <>
              <div className="flex flex-col items-center gap-4 sm:flex-row">
                <SignInProviderButton
                  className="w-full sm:flex-1"
                  label={t("buttonLabel", { provider: "Google" })}
                  providerId="google"
                  onPress={() => void continueWithGoogleAction(callbackURL)}
                />

                <SignInProviderButton
                  className="w-full sm:flex-1"
                  label={t("buttonLabel", { provider: "Microsoft" })}
                  providerId="microsoft"
                  onPress={() => void continueWithMicrosoftAction(callbackURL)}
                />
              </div>

              <div className="my-3 flex items-center">
                <Divider aria-hidden="true" className="h-px flex-1" />

                <span className="text-x-sm text-subdued mx-4">{t("or")}</span>

                <Divider aria-hidden="true" className="h-px flex-1" />
              </div>
            </>
          )}

          <XInput isRequired id="email" type="email" />

          <XInput
            isRequired
            endContent={
              <button tabIndex={-1} type="button" onClick={signInCardStore.toggleShowPassword}>
                <XIcon className="text-subdued" icon={signInCardStore.showPassword ? EyeSlashIcon : EyeIcon} />
              </button>
            }
            id="password"
            type={signInCardStore.showPassword ? "text" : "password"}
          />

          <div className="flex w-full justify-between items-start gap-3">
            <XCheckbox id="rememberMe">{t("rememberMe")}</XCheckbox>

            <XLink href="/auth/forgot-password" size="sm">
              {t("forgotPassword")}
            </XLink>
          </div>
        </XCardBody>

        <XCardFooter>
          <div className="flex w-full flex-col space-y-3 items-center">
            <Button className="w-full" color="primary" isLoading={isLoading} type="submit">
              {t("signInCta")}
            </Button>

            <p className="text-x-xs text-subdued text-center mt-2">
              {t.rich("agreeToTerms", {
                dataPrivacyLink: (chunks) => (
                  <XLink inheritSize className="text-inherit" href="/privacy" target="_blank" underline="always">
                    {chunks}
                  </XLink>
                ),
                termsOfServiceLink: (chunks) => (
                  <XLink inheritSize className="text-inherit" href="/terms" target="_blank" underline="always">
                    {chunks}
                  </XLink>
                ),
              })}
            </p>
          </div>
        </XCardFooter>
      </XCard>
    </XForm>
  );
});
