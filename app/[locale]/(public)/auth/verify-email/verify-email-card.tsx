"use client";

import { observer } from "mobx-react-lite";
import { Button } from "@/components/ui/button";
import { useTranslations } from "next-intl";
import { useLayoutEffect } from "react";

import { AppCard } from "@/components/card/app-card";
import { AppCardBody } from "@/components/card/app-card-body";
import { AppCardFooter } from "@/components/card/app-card-footer";
import { CardHeroHeader } from "@/components/card/card-hero-header";
import { useRootStore } from "@/core/stores/root-store.provider";

export const VerifyEmailCard = observer(({ email }: { email?: string }) => {
  const t = useTranslations();
  const { verifyEmailStore } = useRootStore();

  useLayoutEffect(() => {
    verifyEmailStore.activate(email);
    return () => verifyEmailStore.deactivate(email);
  }, [email, verifyEmailStore]);

  return (
    <AppCard className="max-w-md">
      <CardHeroHeader subtitle={t("VerifyEmailCard.subtitle")} title={t("VerifyEmailCard.title")} />

      <AppCardBody>
        <p className="text-x-sm text-center">{t("VerifyEmailCard.body")}</p>
      </AppCardBody>

      <AppCardFooter>
        <Button className="w-full" variant="secondary" onClick={() => window.location.reload()}>
          {t("Common.actions.refresh")}
        </Button>

        <Button
          className="w-full"
          disabled={verifyEmailStore.isSent || !email}
          onClick={() => void verifyEmailStore.resend()}
        >
          {t("VerifyEmailCard.ctaLabel")}
        </Button>
      </AppCardFooter>
    </AppCard>
  );
});
