"use client";

import { useEffect, useState } from "react";

import { onboardingIntentFromPath } from "@/features/company/onboarding-intent-url";

export function useOnboardingIntentFromLocation(pathname: string): string | undefined {
  const [onboardingIntent, setOnboardingIntent] = useState<string>();

  useEffect(() => {
    const resolution = onboardingIntentFromPath(window.location.search);
    setOnboardingIntent(resolution.status === "valid" ? resolution.intent : undefined);
  }, [pathname]);

  return onboardingIntent;
}
