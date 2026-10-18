"use client";

import { useState } from "react";

import { signOutFromPublicNavbar } from "./public-navbar-sign-out";

import { toastZodErrorTree } from "@/core/utils/toast-zod-error-tree";

export function usePublicNavbarSignOut(onboardingIntent?: string, onSignedOut?: () => void) {
  const [signingOut, setSigningOut] = useState(false);

  async function signOut() {
    if (signingOut) return;
    setSigningOut(true);
    try {
      const result = await signOutFromPublicNavbar(onboardingIntent);
      if (!result) return;
      if (result.ok) {
        onSignedOut?.();
        setSigningOut(false);
        return;
      }

      toastZodErrorTree(result.error);
      setSigningOut(false);
    } catch (error) {
      setSigningOut(false);
      throw error;
    }
  }

  return { signOut, signingOut };
}
