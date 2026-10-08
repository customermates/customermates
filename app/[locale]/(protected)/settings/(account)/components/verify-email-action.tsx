"use client";

import { useTranslations } from "next-intl";
import { MailWarning } from "lucide-react";

import { TopBarActionButtons } from "@/components/shared/top-bar-action-buttons";
import { useRootStore } from "@/core/stores/root-store.provider";

export function VerifyEmailAction() {
  const t = useTranslations();
  const { userStore } = useRootStore();

  return (
    <TopBarActionButtons
      actions={[
        {
          id: "verify-email",
          anchorId: "settings-profile-verify-email",
          icon: MailWarning,
          label: t("EmailVerification.resend"),
          onClick: () => userStore.resendVerificationEmail(),
        },
      ]}
    />
  );
}
