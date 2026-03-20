"use client";

import { useState } from "react";
import { Button } from "@heroui/button";
import { addToast } from "@heroui/toast";
import { useTranslations } from "next-intl";

import { resendVerificationEmailAction } from "../actions";

import { XCard } from "@/components/x-card/x-card";
import { XCardBody } from "@/components/x-card/x-card-body";
import { XCardFooter } from "@/components/x-card/x-card-footer";
import { XCardHeroHeader } from "@/components/x-card/x-card-hero-header";

export function VerifyEmailCard({ email }: { email?: string }) {
  const t = useTranslations("VerifyEmailCard");
  const [isLoading, setIsLoading] = useState(false);
  const [isSent, setIsSent] = useState(false);

  async function handleResend() {
    if (!email) return;

    setIsLoading(true);
    try {
      await resendVerificationEmailAction(email);
      setIsSent(true);
      addToast({ description: t("resendSuccess"), color: "success" });
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <XCard className="max-w-md">
      <XCardHeroHeader subtitle={t("subtitle")} title={t("title")} />

      <XCardBody>
        <p className="text-x-sm text-center">{t("body")}</p>
      </XCardBody>

      <XCardFooter>
        <Button
          className="w-full"
          color="primary"
          isDisabled={isSent || !email}
          isLoading={isLoading}
          onPress={() => void handleResend()}
        >
          {t("ctaLabel")}
        </Button>
      </XCardFooter>
    </XCard>
  );
}
