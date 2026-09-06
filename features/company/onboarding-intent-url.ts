export const ONBOARDING_INTENT_QUERY_PARAM = "intent";

export function pathWithOnboardingIntent(path: string, onboardingIntent: string): string {
  const separator = path.includes("?") ? "&" : "?";
  return `${path}${separator}${ONBOARDING_INTENT_QUERY_PARAM}=${encodeURIComponent(onboardingIntent)}`;
}

export function onboardingIntentAuthRedirects(onboardingIntent: string) {
  return {
    overdueVerification: pathWithOnboardingIntent("/auth/verify-email", onboardingIntent),
    unauthenticated: pathWithOnboardingIntent("/auth/signin", onboardingIntent),
  } as const;
}

export type OnboardingIntentFromPath =
  | { status: "absent" }
  | { status: "invalid" }
  | { intent: string; status: "valid" };

export function onboardingIntentFromPath(path: string | undefined): OnboardingIntentFromPath {
  if (!path) return { status: "absent" };

  try {
    const values = new URL(path, "https://customermates.local").searchParams.getAll(ONBOARDING_INTENT_QUERY_PARAM);
    if (values.length === 0) return { status: "absent" };
    if (values.length !== 1 || !values[0]) return { status: "invalid" };
    return { intent: values[0], status: "valid" };
  } catch {
    return { status: "invalid" };
  }
}
