import type { TemplateLocale, TemplateSpec } from "./template-spec.schema";

import { CLOUD_TRIAL, PLAN_CATALOG } from "@/core/commercial/plan-catalog";
import { SIGNUP_PATH, SIGNUP_TEMPLATE_QUERY_PARAM } from "@/features/acquisition/signup-link";
import { env } from "@/env";
import { buildLocalePath } from "@/i18n/locale-registry";

import { renderTemplatePrompt } from "./template-prompt";

const CLOUD_TRIAL_ROUTINES = PLAN_CATALOG[CLOUD_TRIAL.plan].entitlements.includedRoutinesPerUser;

export function templateSignupPath(slug: string): string {
  return `${SIGNUP_PATH}?${SIGNUP_TEMPLATE_QUERY_PARAM}=${encodeURIComponent(slug)}`;
}

export function signupUrl(locale: string): string {
  return `${env.BASE_URL}${buildLocalePath(locale, SIGNUP_PATH)}`;
}

export function templatePrompts(
  spec: TemplateSpec,
  text: TemplateLocale,
  locale: string,
): { cloud: string; selfHosted: string } {
  return {
    cloud: renderTemplatePrompt(spec, text, {
      deployment: "cloud",
      signupUrl: signupUrl(locale),
      routineAllowance: CLOUD_TRIAL_ROUTINES,
    }),
    selfHosted: renderTemplatePrompt(spec, text, { deployment: "self-hosted", signupUrl: signupUrl(locale) }),
  };
}
