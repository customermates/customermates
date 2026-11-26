"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { ExternalLink, Loader2, Mail } from "lucide-react";

import { AppCard } from "@/components/card/app-card";
import { AppCardBody } from "@/components/card/app-card-body";
import { IconContainer } from "@/components/shared/icon-container";
import { Button } from "@/components/ui/button";
import { runUserAction } from "@/core/errors/report-application-error";
import { serverRenderedClient } from "@/core/utils/server-rendered-client";
import { useRouter } from "@/i18n/navigation";
import { toast } from "sonner";
import { resendVerificationEmailFromAuthAction } from "@/app/[locale]/(public)/auth/actions";

import { mailInboxFor } from "./mail-inbox-link";

export const CONFIRM_EMAIL_POLL_MS = 4_000;
export const CONFIRM_EMAIL_RESEND_SECONDS = 45;

type Props = { email: string; onboardingIntent?: string };

function ConfirmEmailCardContent({ email, onboardingIntent }: Props) {
  const t = useTranslations();
  const router = useRouter();
  const inbox = mailInboxFor(email);
  const [secondsLeft, setSecondsLeft] = useState(CONFIRM_EMAIL_RESEND_SECONDS);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    const refresh = () => router.refresh();
    const timer = window.setInterval(refresh, CONFIRM_EMAIL_POLL_MS);
    window.addEventListener("focus", refresh);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", refresh);
    };
  }, [router]);

  useEffect(() => {
    if (secondsLeft <= 0) return;
    const timer = window.setTimeout(() => setSecondsLeft((current) => current - 1), 1_000);
    return () => window.clearTimeout(timer);
  }, [secondsLeft]);

  const resend = async () => {
    setSending(true);
    try {
      const result = await resendVerificationEmailFromAuthAction({ onboardingIntent });
      if (!result.ok) {
        toast.error(t("Common.notifications.unexpectedError"));
        return;
      }
      toast.success(t("VerifyEmailCard.resendSuccess"));
      setSecondsLeft(CONFIRM_EMAIL_RESEND_SECONDS);
    } finally {
      setSending(false);
    }
  };

  return (
    <AppCard className="max-w-xl shadow-xl shadow-primary/5" id="onboarding-confirm-email">
      <AppCardBody className="items-center text-center">
        <IconContainer color="muted" icon={Mail} size="md" />

        <div className="flex flex-col gap-1.5">
          <h1 className="text-xl font-semibold text-balance sm:text-2xl">{t("OnboardingWizard.confirmEmail.title")}</h1>

          <p className="text-sm text-pretty text-muted-foreground">
            {t.rich("OnboardingWizard.confirmEmail.body", {
              email,
              strong: (chunks) => <strong className="font-medium text-foreground">{chunks}</strong>,
            })}
          </p>
        </div>

        <div className="flex w-full flex-wrap items-center justify-center gap-2 max-sm:flex-col max-sm:items-stretch">
          {inbox ? (
            <Button asChild className="min-h-11" variant="secondary">
              <a href={inbox.url} id="onboarding-confirm-email-open" rel="noopener noreferrer" target="_blank">
                {t("OnboardingWizard.confirmEmail.open", { inbox: inbox.name })}

                <ExternalLink aria-hidden="true" className="size-4" />
              </a>
            </Button>
          ) : null}

          <Button
            className="min-h-11"
            disabled={sending || secondsLeft > 0}
            id="onboarding-confirm-email-resend"
            type="button"
            variant="ghost"
            onClick={() => runUserAction(resend)}
          >
            {sending ? <Loader2 aria-hidden="true" className="size-4 animate-spin motion-reduce:animate-none" /> : null}

            {secondsLeft > 0
              ? t("OnboardingWizard.confirmEmail.resendIn", { seconds: secondsLeft })
              : t("OnboardingWizard.confirmEmail.resend")}
          </Button>
        </div>

        <p aria-live="polite" className="text-xs text-muted-foreground" role="status">
          {t("OnboardingWizard.confirmEmail.waiting")}
        </p>
      </AppCardBody>
    </AppCard>
  );
}

export const ConfirmEmailCard = serverRenderedClient(ConfirmEmailCardContent);
