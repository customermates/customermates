const UTM = "utm_source=public_dashboard&utm_medium=referral&utm_campaign=public_link";

export type PublicSignupSpot = "badge" | "export" | "form";

export function publicSignupHref(spot: PublicSignupSpot): string {
  return `/auth/signup?${UTM}&utm_content=${spot}`;
}
