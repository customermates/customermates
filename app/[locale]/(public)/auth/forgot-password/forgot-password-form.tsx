"use client";

import { useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { observer } from "mobx-react-lite";
import { Button } from "@/components/ui/button";
import { useEffect } from "react";

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

export const ForgotPasswordForm = observer(() => {
  const t = useTranslations();

  const searchParams = useSearchParams();
  const info = searchParams.get("info");

  const { forgotPasswordStore } = useRootStore();
  const { form, isLoading } = forgotPasswordStore;

  useEffect(() => {
    forgotPasswordStore.setWithUnsavedChangesGuard(false);
  }, []);

  return (
    <AppForm store={forgotPasswordStore}>
      <AppCard className="max-w-md">
        <CardHeroHeader
          subtitle={t.rich("ForgotPasswordForm.backToSignIn", {
            backToSignInLink: (chunks) => (
              <AppLink inheritSize appearance="inline" href="/auth/signin">
                {chunks}
              </AppLink>
            ),
          })}
          title={t("ForgotPasswordForm.title")}
        />

        <AppCardBody>
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
