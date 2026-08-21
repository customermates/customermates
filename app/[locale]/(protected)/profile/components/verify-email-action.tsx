"use client";

import { useTranslations } from "next-intl";
import { MailWarning } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useRootStore } from "@/core/stores/root-store.provider";
import { runUserAction } from "@/core/errors/report-application-error";

export function VerifyEmailAction() {
  const t = useTranslations();
  const { userStore } = useRootStore();

  return (
    <Button
      className="h-8"
      size="sm"
      type="button"
      variant="secondary"
      onClick={() => runUserAction(() => userStore.resendVerificationEmail())}
    >
      <MailWarning className="size-3.5" />

      <span className="hidden sm:inline">{t("EmailVerification.resend")}</span>
    </Button>
  );
}
