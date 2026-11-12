import { SIGNUP_JOB_QUERY_PARAM } from "@/features/onboarding-funnel/onboarding-job";
import { buildLocalePath } from "@/i18n/locale-registry";

export const CLOUD_ORIGIN = "https://customermates.com";

export function cloudMateSignupUrl(locale: string): string {
  const url = new URL(buildLocalePath(locale, "/auth/signup"), CLOUD_ORIGIN);
  url.searchParams.set(SIGNUP_JOB_QUERY_PARAM, "workspace");
  return url.toString();
}
