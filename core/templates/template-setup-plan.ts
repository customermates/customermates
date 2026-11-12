import type { SetupPlan } from "@/features/workspace-setup/setup-plan.schema";

import { SetupPlanSchema } from "@/features/workspace-setup/setup-plan.schema";

import { compileTemplate } from "./compile-template";
import { getTemplate, getTemplateText } from "./template-registry";
import { isTemplateSlug } from "./template-slugs";

export type TemplateSetupPlanOptions = { language: string; currency: string };

export function templateSetupPlan(slug: string | null | undefined, options: TemplateSetupPlanOptions): SetupPlan | null {
  if (!isTemplateSlug(slug)) return null;
  const { plan } = compileTemplate(getTemplate(slug), getTemplateText(slug, options.language));
  const parsed = SetupPlanSchema.safeParse({ ...plan, workspace: { ...plan.workspace, currency: options.currency } });
  return parsed.success ? parsed.data : null;
}
