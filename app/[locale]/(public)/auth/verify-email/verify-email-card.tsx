"use client";

import { observer } from "mobx-react-lite";
import { Button } from "@/components/ui/button";
import { useTranslations } from "next-intl";
import { useLayoutEffect } from "react";

import { AppCard } from "@/components/card/app-card";
import { AppCardBody } from "@/components/card/app-card-body";
import { AppCardFooter } from "@/components/card/app-card-footer";
import { CardHeroHeader } from "@/components/card/card-hero-header";
import { AppLink } from "@/components/shared/app-link";
import { useRootStore } from "@/core/stores/root-store.provider";
import { runUserAction } from "@/core/errors/report-application-error";
import { Alert } from "@/components/shared/alert";
import { useRouter } from "@/i18n/navigation";

type Props = {
  email?: string;
  inviterName?: string;
  justVerified?: boolean;
  linkProblem?: "expired" | "invalid";
  onboardingIntent?: string;
};

export const VerifyEmailCard = observer(
  ({ email, inviterName, justVerified, linkProblem, onboardingIntent }: Props) => {
    const t = useTranslations();
    const router = useRouter();
    const { verifyEmailStore } = useRootStore();
    const signedOut = email === undefined;

    useLayoutEffect(() => {
      verifyEmailStore.activate(email, onboardingIntent);
      return () => verifyEmailStore.deactivate(email);
    }, [email, onboardingIntent, verifyEmailStore]);

    const body = !signedOut
      ? t("VerifyEmailCard.body")
      : justVerified && !linkProblem
        ? t("VerifyEmailCard.verifiedSignIn")
        : t("VerifyEmailCard.signedOutBody");

    return (
      <AppCard className="max-w-md">
        <CardHeroHeader alt="" subtitle={t("VerifyEmailCard.subtitle")} title={t("VerifyEmailCard.title")} />

        <AppCardBody>
          {inviterName ? (
            <Alert role="note">
              <p className="text-x-sm">{t("VerifyEmailCard.invitationFrom", { inviterName })}</p>
            </Alert>
          ) : null}

          {linkProblem ? (
            <Alert color="warning">
              <p className="text-x-sm">
                {linkProblem === "expired" ? t("VerifyEmailCard.linkExpired") : t("VerifyEmailCard.linkInvalid")}
              </p>
            </Alert>
          ) : null}

          <p className="text-x-sm text-center">{body}</p>

          {signedOut ? (
            <div className="flex w-full justify-center">
              <AppLink href="/auth/forgot-password">{t("SignInForm.forgotPassword")}</AppLink>
            </div>
          ) : null}
        </AppCardBody>

        <AppCardFooter>
          {signedOut ? (
            <Button className="w-full" onClick={() => router.push("/auth/signin")}>
              {t("SignInForm.signInCta")}
            </Button>
          ) : (
            <>
              <Button className="w-full" variant="secondary" onClick={() => window.location.reload()}>
                {t("Common.actions.refresh")}
              </Button>

              <Button
                className="w-full"
                disabled={verifyEmailStore.isSent}
                onClick={() => runUserAction(() => verifyEmailStore.resend())}
              >
                {t("VerifyEmailCard.ctaLabel")}
              </Button>
            </>
          )}
        </AppCardFooter>
      </AppCard>
    );
  },
);
