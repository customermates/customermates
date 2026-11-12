import type { PublicFormRepo, StoredPublicForm } from "./public-form.repo";
import type { PublicFormQuota } from "./public-form-quota";
import type { PublicFormDto, PublicFormUsage } from "./public-form.schema";

import { parsePublicFormConfig } from "./public-form-access";
import { startOfUtcMonth } from "./public-form-quota";
import { publicFormEmbedSnippet, publicFormUrl } from "./public-form-token";

export type PublicFormSettings = { baseUrl: string; authSecret: string | undefined; now?: () => Date };

export async function readPublicFormUsage(
  repo: Pick<PublicFormRepo, "countSubmissionsSince">,
  quota: PublicFormQuota,
  now: Date,
): Promise<PublicFormUsage> {
  const [limits, submissionsThisMonth] = await Promise.all([
    quota.limits(),
    repo.countSubmissionsSince(startOfUtcMonth(now)),
  ]);
  return { submissionsThisMonth, monthlyLimit: limits.submissionsPerMonth, badge: limits.badge };
}

export function toPublicFormDto(
  form: StoredPublicForm,
  usage: PublicFormUsage,
  settings: PublicFormSettings,
): PublicFormDto | null {
  const config = parsePublicFormConfig(form.config);
  if (!config) return null;
  const url = publicFormUrl(settings.baseUrl, form.id, settings.authSecret, config.locale);
  return {
    id: form.id,
    typeId: form.typeId,
    name: form.name,
    enabled: form.enabled,
    url,
    embedSnippet: publicFormEmbedSnippet(url, config.title),
    config,
    consentVersion: form.consentVersion,
    submissionCount: form.submissionCount,
    lastSubmittedAt: form.lastSubmittedAt?.toISOString() ?? null,
    createdAt: form.createdAt.toISOString(),
    updatedAt: form.updatedAt.toISOString(),
    usage,
  };
}
