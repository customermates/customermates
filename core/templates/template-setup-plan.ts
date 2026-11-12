import type { SetupPlan } from "@/features/workspace-setup/setup-plan.schema";

import { SetupPlanSchema } from "@/features/workspace-setup/setup-plan.schema";

import { compileTemplate } from "./compile-template";
import { loadTemplate } from "./template-registry";
import { isTemplateSlug } from "./template-slugs";

export type TemplateSetupPlanOptions = { language: string; currency: string };

export async function templateSetupPlan(
  slug: string | null | undefined,
  options: TemplateSetupPlanOptions,
): Promise<SetupPlan | null> {
  if (!isTemplateSlug(slug)) return null;
  const { spec, text } = await loadTemplate(slug, options.language);
  const { plan } = compileTemplate(spec, text);
  const parsed = SetupPlanSchema.safeParse({ ...plan, workspace: { ...plan.workspace, currency: options.currency } });
  return parsed.success ? parsed.data : null;
}
