"use client";

import { observer } from "mobx-react-lite";
import { Button } from "@/components/ui/button";
import { useTranslations } from "next-intl";
import { useLayoutEffect } from "react";

import { AppCard } from "@/components/card/app-card";
import { AppCardBody } from "@/components/card/app-card-body";
import { AppCardFooter } from "@/components/card/app-card-footer";
import { AppForm } from "@/components/forms/form-context";
import { FormInput } from "@/components/forms/form-input";
import { CardHeroHeader } from "@/components/card/card-hero-header";
import { useRootStore } from "@/core/stores/root-store.provider";
import { Alert } from "@/components/shared/alert";

type Props = {
  email?: string;
  inviterName?: string;
  onboardingIntent?: string;
};

export const VerifyEmailCard = observer(({ email, inviterName, onboardingIntent }: Props) => {
  const t = useTranslations();
  const { verifyEmailStore } = useRootStore();
  const needsEmail = email === undefined;

  useLayoutEffect(() => {
    verifyEmailStore.activate(email, onboardingIntent);
    return () => verifyEmailStore.deactivate(email);
  }, [email, onboardingIntent, verifyEmailStore]);

  return (
    <AppForm store={verifyEmailStore}>
      <AppCard className="max-w-md">
        <CardHeroHeader alt="" subtitle={t("VerifyEmailCard.subtitle")} title={t("VerifyEmailCard.title")} />

        <AppCardBody>
          {inviterName ? (
            <Alert role="note">
              <p className="text-x-sm">{t("VerifyEmailCard.invitationFrom", { inviterName })}</p>
            </Alert>
          ) : null}

          <p className="text-x-sm text-center">
            {needsEmail ? t("VerifyEmailCard.anonymousBody") : t("VerifyEmailCard.body")}
          </p>

          {needsEmail ? <FormInput required autoComplete="email" id="email" type="email" /> : null}
        </AppCardBody>

        <AppCardFooter>
          {needsEmail ? null : (
            <Button className="w-full" type="button" variant="secondary" onClick={() => window.location.reload()}>
              {t("Common.actions.refresh")}
            </Button>
          )}

          <Button
            className="w-full"
            disabled={verifyEmailStore.isSent || (needsEmail && !verifyEmailStore.form.email.trim())}
            type="submit"
          >
            {t("VerifyEmailCard.ctaLabel")}
          </Button>
        </AppCardFooter>
      </AppCard>
    </AppForm>
  );
});
