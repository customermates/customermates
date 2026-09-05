import { signOutAction, signOutWithOnboardingIntentAction } from "@/app/[locale]/actions";

export async function signOutFromPublicNavbar(onboardingIntent?: string) {
  if (onboardingIntent) {
    await signOutWithOnboardingIntentAction(onboardingIntent);
    return null;
  }

  return signOutAction();
}
