"use client";

import { useTranslations } from "next-intl";
import { observer } from "mobx-react-lite";
import { Button } from "@heroui/button";
import { Divider } from "@heroui/divider";
import { EyeSlashIcon, EyeIcon } from "@heroicons/react/24/outline";
import { useEffect } from "react";

import SignInProviderButton from "../signin/sign-in-provider-button";
import { continueWithGoogleAction, continueWithMicrosoftAction } from "../actions";

import { XLink } from "@/components/x-link";
import { XForm } from "@/components/x-inputs/x-form";
import { XInput } from "@/components/x-inputs/x-input";
import { useRootStore } from "@/core/stores/root-store.provider";
import { XAlert } from "@/components/x-alert";
import { i18nFormatters } from "@/i18n/formatters";
import { XIcon } from "@/components/x-icon";
import { XCard } from "@/components/x-card/x-card";
import { XCardBody } from "@/components/x-card/x-card-body";
import { XCardFooter } from "@/components/x-card/x-card-footer";
import { XCardHeroHeader } from "@/components/x-card/x-card-hero-header";
import { XReveal } from "@/components/x-reveal";

type Props = {
  companyName: string | null;
  showSocialProviders: boolean;
};

export const SignUpCard = observer(({ companyName, showSocialProviders }: Props) => {
  const t = useTranslations("SignUpCard");
  const { signUpCardStore } = useRootStore();
  const { isLoading, form } = signUpCardStore;

  useEffect(() => {
    signUpCardStore.setWithUnsavedChangesGuard(false);
  }, []);

  return (
    <XForm store={signUpCardStore}>
      <XCard className="max-w-lg">
        <XCardHeroHeader
          subtitle={t.rich("switchToSignIn", {
            signInLink: (chunks) => (
              <XLink inheritSize href="/auth/signin">
                {chunks}
              </XLink>
            ),
          })}
          title={companyName ? t("inviteTitle") : t("title")}
        />

        <XCardBody>
          {companyName ? (
            <XAlert className="mb-4" color="success">
              <p className="text-x-sm">{t.rich("inviteSubtitle", { ...i18nFormatters, company: companyName })}</p>
            </XAlert>
          ) : (
            <XAlert className="mb-4" color="primary">
              <p className="text-x-sm">{t("newCompanySubtitle")}</p>
            </XAlert>
          )}

          {showSocialProviders && (
            <>
              <div className="flex flex-col items-center gap-4 sm:flex-row">
                <SignInProviderButton
                  className="w-full sm:flex-1"
                  label={t("buttonLabel", { provider: "Google" })}
                  providerId="google"
                  onPress={() => void continueWithGoogleAction()}
                />

                <SignInProviderButton
                  className="w-full sm:flex-1"
                  label={t("buttonLabel", { provider: "Microsoft" })}
                  providerId="microsoft"
                  onPress={() => void continueWithMicrosoftAction()}
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

          <XReveal show={Boolean(form.email?.trim())}>
            <XInput isRequired id="confirmEmail" type="email" />
          </XReveal>

          <XInput
            isRequired
            endContent={
              <button tabIndex={-1} type="button" onClick={signUpCardStore.toggleShowPassword}>
                <XIcon className="text-subdued" icon={signUpCardStore.showPassword ? EyeSlashIcon : EyeIcon} />
              </button>
            }
            id="password"
            type={signUpCardStore.showPassword ? "text" : "password"}
          />

          <XInput
            isRequired
            endContent={
              <button tabIndex={-1} type="button" onClick={signUpCardStore.toggleShowPassword}>
                <XIcon className="text-subdued" icon={signUpCardStore.showPassword ? EyeSlashIcon : EyeIcon} />
              </button>
            }
            id="confirmPassword"
            type={signUpCardStore.showPassword ? "text" : "password"}
          />
        </XCardBody>

        <XCardFooter>
          <div className="flex w-full flex-col space-y-3 items-center">
            <Button className="w-full" color="primary" isLoading={isLoading} type="submit">
              {companyName ? t("acceptInviteCta") : t("signUpCta")}
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
