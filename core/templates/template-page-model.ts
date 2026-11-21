import type { TemplateLocale, TemplateSpec } from "./template-spec.schema";

import { CLOUD_TRIAL, PLAN_CATALOG } from "@/core/commercial/plan-catalog";
import { SIGNUP_PATH, SIGNUP_TEMPLATE_QUERY_PARAM } from "@/features/acquisition/signup-link";

import { renderTemplatePrompt } from "./template-prompt";

const CLOUD_TRIAL_ROUTINES = PLAN_CATALOG[CLOUD_TRIAL.plan].entitlements.includedRoutinesPerUser;

export function templateSignupPath(slug: string): string {
  return `${SIGNUP_PATH}?${SIGNUP_TEMPLATE_QUERY_PARAM}=${encodeURIComponent(slug)}`;
}

export function templatePagePrompt(spec: TemplateSpec, text: TemplateLocale): string {
  return renderTemplatePrompt(spec, text, { routineAllowance: CLOUD_TRIAL_ROUTINES });
}
