import type { TemplateLocale, TemplateSpec } from "./template-spec.schema";

import { CLOUD_TRIAL, PLAN_CATALOG } from "@/core/commercial/plan-catalog";
import { env } from "@/env";
import { buildLocalePath } from "@/i18n/locale-registry";

import { renderTemplatePrompt } from "./template-prompt";

const CLOUD_TRIAL_ROUTINES = PLAN_CATALOG[CLOUD_TRIAL.plan].entitlements.includedRoutinesPerUser;

export const SIGNUP_PATH = "/auth/signup";

export function templateSignupPath(slug: string): string {
  return `${SIGNUP_PATH}?template=${encodeURIComponent(slug)}`;
}

export function templatePrompts(
  spec: TemplateSpec,
  text: TemplateLocale,
  locale: string,
): { cloud: string; selfHosted: string } {
  const signupUrl = `${env.BASE_URL}${buildLocalePath(locale, SIGNUP_PATH)}`;
  return {
    cloud: renderTemplatePrompt(spec, text, { deployment: "cloud", signupUrl, routineAllowance: CLOUD_TRIAL_ROUTINES }),
    selfHosted: renderTemplatePrompt(spec, text, { deployment: "self-hosted", signupUrl }),
  };
}
