"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { MailWarning } from "lucide-react";

import { AppCard } from "@/components/card/app-card";
import { AppCardBody } from "@/components/card/app-card-body";
import { AppCardHeader } from "@/components/card/app-card-header";
import { AppModal } from "@/components/modal";
import { TopBarActionButtons } from "@/components/shared/top-bar-action-buttons";
import { useRouter } from "@/i18n/navigation";
import { EmailCodeForm } from "@/app/[locale]/(public)/auth/verify-email/email-code-form";

type Props = { email: string };

export function VerifyEmailAction({ email }: Props) {
  const t = useTranslations();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const title = t("EmailVerification.dialogTitle");

  return (
    <>
      <TopBarActionButtons
        actions={[
          {
            id: "verify-email",
            anchorId: "settings-profile-verify-email",
            icon: MailWarning,
            label: t("EmailVerification.verify"),
            onClick: () => setOpen(true),
          },
        ]}
      />

      <AppModal open={open} size="sm" title={title} onClose={() => setOpen(false)}>
        <AppCard>
          <AppCardHeader>
            <h2 className="text-x-lg grow">{title}</h2>
          </AppCardHeader>

          <AppCardBody className="gap-4">
            <p className="text-sm text-muted-foreground">{t("EmailVerification.dialogBody", { email })}</p>

            {open ? (
              <EmailCodeForm
                sendOnMount
                email={email}
                idPrefix="settings-verify-email"
                onVerified={() => {
                  setOpen(false);
                  router.refresh();
                }}
              />
            ) : null}
          </AppCardBody>
        </AppCard>
      </AppModal>
    </>
  );
}
