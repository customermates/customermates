"use client";

import { useTranslations } from "next-intl";
import { ExternalLink } from "lucide-react";

import { AppCard } from "@/components/card/app-card";
import { AppCardBody } from "@/components/card/app-card-body";
import { CardHeroHeader } from "@/components/card/card-hero-header";
import { Button } from "@/components/ui/button";
import { runUserAction } from "@/core/errors/report-application-error";
import { serverRenderedClient } from "@/core/utils/server-rendered-client";
import { useRouter } from "@/i18n/navigation";
import { usePublicNavbarSignOut } from "@/app/components/navigation/use-public-navbar-sign-out";
import { EmailCodeForm } from "@/app/[locale]/(public)/auth/verify-email/email-code-form";

import { mailInboxFor } from "./mail-inbox-link";

type Props = { email: string };

function ConfirmEmailCardContent({ email }: Props) {
  const t = useTranslations();
  const router = useRouter();
  const inbox = mailInboxFor(email);
  const { signOut, signingOut } = usePublicNavbarSignOut(undefined, () => router.push("/auth/signup"));

  return (
    <AppCard className="max-w-lg" id="onboarding-confirm-email">
      <CardHeroHeader
        alt=""
        subtitle={t.rich("OnboardingWizard.confirmEmail.body", {
          email,
          strong: (chunks) => <strong className="font-medium text-foreground">{chunks}</strong>,
        })}
        title={t("OnboardingWizard.confirmEmail.title")}
      />

      <AppCardBody className="items-center text-center">
        <div className="w-full max-w-xs">
          <EmailCodeForm
            startWithCooldown
            email={email}
            idPrefix="onboarding-confirm-email"
            onVerified={() => router.refresh()}
          />
        </div>

        {inbox ? (
          <Button asChild className="min-h-11" variant="secondary">
            <a href={inbox.url} id="onboarding-confirm-email-open" rel="noopener noreferrer" target="_blank">
              {t("OnboardingWizard.confirmEmail.open", { inbox: inbox.name })}

              <ExternalLink aria-hidden="true" className="size-4" />
            </a>
          </Button>
        ) : null}

        <p className="text-xs text-muted-foreground">
          {t.rich("OnboardingWizard.confirmEmail.wrongEmail", {
            signOut: (chunks) => (
              <Button
                className="h-auto p-0 text-xs"
                disabled={signingOut}
                id="onboarding-confirm-email-sign-out"
                type="button"
                variant="link"
                onClick={() => runUserAction(signOut)}
              >
                {chunks}
              </Button>
            ),
          })}
        </p>
      </AppCardBody>
    </AppCard>
  );
}

export const ConfirmEmailCard = serverRenderedClient(ConfirmEmailCardContent);
