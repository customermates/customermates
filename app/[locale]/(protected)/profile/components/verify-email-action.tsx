"use client";

import { useTranslations } from "next-intl";
import { MailWarning } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useRootStore } from "@/core/stores/root-store.provider";

export function VerifyEmailAction() {
  const t = useTranslations();
  const { userStore } = useRootStore();

  return (
    <Button
      className="h-8"
      size="sm"
      type="button"
      variant="secondary"
      onClick={() => void userStore.resendVerificationEmail()}
    >
      <MailWarning className="size-3.5" />

      <span className="hidden sm:inline">{t("EmailVerification.resend")}</span>
    </Button>
  );
}
