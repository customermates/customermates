import type { TemplateLocale, TemplateSpec } from "./template-spec.schema";

import { env } from "@/env";
import { buildLocalePath } from "@/i18n/locale-registry";

import { renderTemplatePrompt } from "./template-prompt";

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
    cloud: renderTemplatePrompt(spec, text, { deployment: "cloud", signupUrl }),
    selfHosted: renderTemplatePrompt(spec, text, { deployment: "self-hosted", signupUrl }),
  };
}
