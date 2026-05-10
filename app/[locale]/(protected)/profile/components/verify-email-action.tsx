"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Loader2, MailWarning } from "lucide-react";

import { resendVerificationEmailFromAppAction } from "../actions";

import { Button } from "@/components/ui/button";

export function VerifyEmailAction() {
  const t = useTranslations("EmailVerification");
  const [isLoading, setIsLoading] = useState(false);

  async function handleResend() {
    setIsLoading(true);
    try {
      const result = await resendVerificationEmailFromAppAction();
      if (result.ok) toast.success(t("resendSuccess"));
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <Button
      className="h-8"
      disabled={isLoading}
      size="sm"
      type="button"
      variant="outline"
      onClick={() => void handleResend()}
    >
      {isLoading ? <Loader2 className="size-3.5 animate-spin" /> : <MailWarning className="size-3.5" />}

      <span>{isLoading ? t("resending") : t("resend")}</span>
    </Button>
  );
}
