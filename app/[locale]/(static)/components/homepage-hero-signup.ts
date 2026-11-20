import type { TemplateSlug } from "@/core/templates/template-slugs";

import { SIGNUP_PATH, SIGNUP_TEMPLATE_QUERY_PARAM } from "@/features/acquisition/signup-link";
import { SIGNUP_JOB_QUERY_PARAM } from "@/features/onboarding-funnel/onboarding-job";

export function homepageHeroSignupHref(template: TemplateSlug): string {
  const params = new URLSearchParams({
    [SIGNUP_JOB_QUERY_PARAM]: "followup",
    [SIGNUP_TEMPLATE_QUERY_PARAM]: template,
  });

  return `${SIGNUP_PATH}?${params.toString()}`;
}
