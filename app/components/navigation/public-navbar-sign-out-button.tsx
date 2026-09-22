"use client";

import { LogOut } from "lucide-react";
import { useState } from "react";
import { useTranslations } from "next-intl";

import { signOutFromPublicNavbar } from "./public-navbar-sign-out";

import { Button } from "@/components/ui/button";
import { runUserAction } from "@/core/errors/report-application-error";
import { toastZodErrorTree } from "@/core/utils/toast-zod-error-tree";

type Props = {
  className?: string;
  onboardingIntent?: string;
  variant: "ghost" | "destructiveOutline";
};

export function PublicNavbarSignOutButton({ className, onboardingIntent, variant }: Props) {
  const t = useTranslations();
  const [signingOut, setSigningOut] = useState(false);

  async function signOut() {
    if (signingOut) return;
    setSigningOut(true);
    try {
      const result = await signOutFromPublicNavbar(onboardingIntent);
      if (!result || result.ok) return;

      toastZodErrorTree(result.error);
      setSigningOut(false);
    } catch (error) {
      setSigningOut(false);
      throw error;
    }
  }

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
