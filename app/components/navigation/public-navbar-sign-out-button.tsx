"use client";

import { LogOut } from "lucide-react";
import { useTranslations } from "next-intl";

import { usePublicNavbarSignOut } from "./use-public-navbar-sign-out";

import { Button } from "@/components/ui/button";
import { runUserAction } from "@/core/errors/report-application-error";

type Props = {
  className?: string;
  onboardingIntent?: string;
  onSignedOut?: () => void;
  variant: "ghost" | "destructiveOutline";
};

export function PublicNavbarSignOutButton({ className, onboardingIntent, onSignedOut, variant }: Props) {
  const t = useTranslations();
  const { signOut, signingOut } = usePublicNavbarSignOut(onboardingIntent, onSignedOut);

  return (
    <Button
      className={className}
      disabled={signingOut}
      size="sm"
      variant={variant}
      onClick={() => runUserAction(signOut)}
    >
      <LogOut aria-hidden className="size-4" />

      {t("UserAvatar.signOut")}
    </Button>
  );
}
