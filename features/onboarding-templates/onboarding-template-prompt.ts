import type { TemplateLocale, TemplateSpec } from "@/core/templates/template-spec.schema";
import type { OnboardingTemplateDeployment } from "./onboarding-template-offer";

import { renderTemplatePrompt } from "@/core/templates/template-prompt";

const WORKSPACE_HEADING = "## 1. Get a workspace";

export function renderOnboardingTemplatePrompt(args: {
  spec: TemplateSpec;
  text: TemplateLocale;
  deployment: OnboardingTemplateDeployment;
  baseUrl: string;
  mcpUrl: string;
}): string {
  const prompt = renderTemplatePrompt(args.spec, args.text, { deployment: args.deployment, signupUrl: args.baseUrl });
  const blocks = prompt.split("\n\n");
  const at = blocks.findIndex((block) => block.startsWith(WORKSPACE_HEADING));
  if (at === -1) return prompt;
  blocks[at] = [
    "## 1. Your workspace",
    `This workspace already exists and you are connected to it through MCP at ${args.mcpUrl}. Work in this workspace and in no other.`,
  ].join("\n");
  return blocks.join("\n\n");
}
