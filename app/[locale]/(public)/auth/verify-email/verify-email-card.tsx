"use client";

import { Button } from "@/components/ui/button";
import { useTranslations } from "next-intl";

import { AppCard } from "@/components/card/app-card";
import { AppCardBody } from "@/components/card/app-card-body";
import { AppCardFooter } from "@/components/card/app-card-footer";
import { CardHeroHeader } from "@/components/card/card-hero-header";
import { AppLink } from "@/components/shared/app-link";
import { Alert } from "@/components/shared/alert";
import { useRouter } from "@/i18n/navigation";
import { serverRenderedClient } from "@/core/utils/server-rendered-client";
import { pathWithOnboardingIntent } from "@/features/company/onboarding-intent-url";

import { EmailCodeForm } from "./email-code-form";

type Props = {
  email?: string;
  inviterName?: string;
  onboardingIntent?: string;
  retiredLink?: boolean;
};

function VerifyEmailCardContent({ email, inviterName, onboardingIntent, retiredLink }: Props) {
  const t = useTranslations();
  const router = useRouter();
  const signInHref = onboardingIntent ? pathWithOnboardingIntent("/auth/signin", onboardingIntent) : "/auth/signin";

  return (
    <AppCard className="max-w-md">
      <CardHeroHeader alt="" subtitle={t("VerifyEmailCard.subtitle")} title={t("VerifyEmailCard.title")} />

      <AppCardBody>
        {inviterName ? (
          <Alert role="note">
            <p className="text-x-sm">{t("VerifyEmailCard.invitationFrom", { inviterName })}</p>
          </Alert>
        ) : null}

        {retiredLink ? (
          <Alert variant="info">
            <p className="text-x-sm">
              {email === undefined ? t("VerifyEmailCard.retiredLinkSignedOut") : t("VerifyEmailCard.retiredLink")}
            </p>
          </Alert>
        ) : null}

        {email === undefined ? (
          <>
            <p className="text-x-sm text-center">{t("VerifyEmailCard.signedOutBody")}</p>

            <div className="flex w-full justify-center">
              <AppLink href="/auth/forgot-password">{t("SignInForm.forgotPassword")}</AppLink>
            </div>
          </>
        ) : (
          <>
            <p className="text-x-sm text-center">
              {t.rich("VerifyEmailCard.body", {
                email,
                strong: (chunks) => <strong className="font-medium text-foreground">{chunks}</strong>,
              })}
            </p>

            <EmailCodeForm email={email} idPrefix="verify-email" onVerified={() => window.location.reload()} />
          </>
        )}
      </AppCardBody>

      {email === undefined ? (
        <AppCardFooter>
          <Button className="w-full" onClick={() => router.push(signInHref)}>
            {t("SignInForm.signInCta")}
          </Button>
        </AppCardFooter>
      ) : null}
    </AppCard>
  );
}

export const VerifyEmailCard = serverRenderedClient(VerifyEmailCardContent);
