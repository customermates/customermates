"use client";

import { useState } from "react";
import { LogOut } from "lucide-react";
import { useTranslations } from "next-intl";

import { AppCard } from "@/components/card/app-card";
import { AppCardBody } from "@/components/card/app-card-body";
import { AppCardFooter } from "@/components/card/app-card-footer";
import { CardHeroHeader } from "@/components/card/card-hero-header";
import { Button } from "@/components/ui/button";
import { IntlLink } from "@/i18n/navigation";
import { runUserAction } from "@/core/errors/report-application-error";
import { signOutWithOnboardingIntentAction } from "@/app/[locale]/actions";
import { pathWithOnboardingIntent } from "@/features/company/onboarding-intent-url";

type Props = {
  canJoin: boolean;
  email: string;
  invitationIntent: string;
  inviterName: string;
};

export function InvitationCard({ canJoin, email, invitationIntent, inviterName }: Props) {
  const t = useTranslations();
  const [isSigningOut, setIsSigningOut] = useState(false);

  async function handleSignOut() {
    if (isSigningOut) return;
    setIsSigningOut(true);
    try {
      await signOutWithOnboardingIntentAction(invitationIntent);
    } catch (error) {
      setIsSigningOut(false);
      throw error;
    }
  }

  const signOutButton = (
    <Button
      className="w-full"
      disabled={isSigningOut}
      variant={canJoin ? "ghost" : "default"}
      onClick={() => runUserAction(handleSignOut)}
    >
      <LogOut aria-hidden className="size-4" />

      {t("UserAvatar.signOut")}
    </Button>
  );

  if (!canJoin) {
    return (
      <AppCard className="max-w-md">
        <CardHeroHeader
          alt=""
          subtitle={t("InvitationCard.switchSubtitle", { email })}
          title={t("InvitationCard.switchTitle")}
        />

        <AppCardBody>
          <p className="text-center text-sm font-medium [overflow-wrap:anywhere]">
            {t("InvitationCard.inviter", { inviterName })}
          </p>

          <p className="text-x-sm text-center">{t("InvitationCard.switchBody")}</p>
        </AppCardBody>

        <AppCardFooter>{signOutButton}</AppCardFooter>
      </AppCard>
    );
  }

  return (
    <AppCard className="max-w-md">
      <CardHeroHeader
        alt=""
        subtitle={t("InvitationCard.joinSubtitle", { email })}
        title={t("InvitationCard.joinTitle")}
      />

      <AppCardBody>
        <p className="text-center text-sm font-medium [overflow-wrap:anywhere]">
          {t("InvitationCard.inviter", { inviterName })}
        </p>

        <p className="text-x-sm text-center">{t("InvitationCard.joinBody")}</p>
      </AppCardBody>

      <AppCardFooter className="flex-col gap-2">
        <Button asChild className="w-full">
          <IntlLink href={pathWithOnboardingIntent("/onboarding/wizard", invitationIntent)}>
            {t("InvitationCard.joinAction")}
          </IntlLink>
        </Button>

        {signOutButton}
      </AppCardFooter>
    </AppCard>
  );
}
