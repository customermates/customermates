import type { TemplateLocale, TemplateSpec } from "@/core/templates/template-spec.schema";
import type { OnboardingTemplateDeployment } from "./onboarding-template-offer";

import { renderTemplatePrompt } from "@/core/templates/template-prompt";

export function renderOnboardingTemplatePrompt(args: {
  spec: TemplateSpec;
  text: TemplateLocale;
  deployment: OnboardingTemplateDeployment;
  baseUrl: string;
  mcpUrl: string;
  connected: boolean;
  routineAllowance?: number | "unlimited" | null;
}): string {
  return renderTemplatePrompt(args.spec, args.text, {
    deployment: args.deployment,
    signupUrl: args.baseUrl,
    connected: args.connected,
    mcpUrl: args.mcpUrl,
    routineAllowance: args.routineAllowance,
  });
}
