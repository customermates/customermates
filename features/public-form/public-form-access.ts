import type { TokenBucketRateLimiter } from "@/core/network/token-bucket-rate-limiter";
import type { PublicFormLookup, PublicFormLookupRepo } from "./public-form-lookup.repo";
import type { PublicFormTenant } from "./public-form-tenant";
import type { PublicFormConfig } from "./public-form.schema";

import { PermissionService } from "@/core/base/permission.service";
import { eventVia } from "@/features/event/event-via";
import { Action, Resource } from "@/generated/prisma";

import { publicFormIdFromToken } from "./public-form-token";
import { PublicFormConfigSchema } from "./public-form.schema";

export type PublicFormBlocked = { status: "unavailable" } | { status: "rateLimited"; retryAfterSeconds: number };

export const PUBLIC_FORM_UNAVAILABLE = { status: "unavailable" } as const;

export type PublicFormOpenMode = "view" | "submit";

export type PublicFormLimiters = {
  view: TokenBucketRateLimiter;
  visitorSubmit: TokenBucketRateLimiter;
  formSubmit: TokenBucketRateLimiter;
};

type Settings = { authSecret: string | undefined; now?: () => Date };

export function parsePublicFormConfig(value: unknown): PublicFormConfig | null {
  const parsed = PublicFormConfigSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

export class PublicFormAccess {
  constructor(
    private lookup: PublicFormLookupRepo,
    private tenant: PublicFormTenant,
    private limiters: PublicFormLimiters,
    private settings: Settings,
  ) {}

  now(): Date {
    return this.settings.now?.() ?? new Date();
  }

  get authSecret(): string | undefined {
    return this.settings.authSecret;
  }

  async open<T>(
    token: string,
    visitor: string | null | undefined,
    mode: PublicFormOpenMode,
    read: (form: PublicFormLookup, config: PublicFormConfig) => Promise<T | PublicFormBlocked>,
  ): Promise<T | PublicFormBlocked> {
    const formId = publicFormIdFromToken(token, this.settings.authSecret);
    if (!formId) return PUBLIC_FORM_UNAVAILABLE;

    const checks =
      mode === "view"
        ? [[this.limiters.view, visitor ? `view:${visitor}` : null] as const]
        : [
            [this.limiters.visitorSubmit, visitor ? `submit:${formId}:${visitor}` : null] as const,
            [this.limiters.formSubmit, `form:${formId}`] as const,
          ];
    for (const [limiter, key] of checks) {
      if (!key) continue;
      const admission = limiter.admit(key);
      if (!admission.allowed) return { status: "rateLimited", retryAfterSeconds: admission.retryAfterSeconds };
    }

    const form = await this.lookup.findFormUnscoped(formId);
    if (
      !form ||
      !form.enabled ||
      !form.company.allowPublicLinks ||
      form.company.deletingAt ||
      form.type.archived
    )
      return PUBLIC_FORM_UNAVAILABLE;
    const config = parsePublicFormConfig(form.config);
    if (!config) return PUBLIC_FORM_UNAVAILABLE;

    return this.tenant.run(
      form.createdById,
      eventVia("form", form.name),
      async () => {
        const creator = new PermissionService();
        if (creator.companyId !== form.companyId || !creator.has(Resource.publicLinks, Action.create))
          return PUBLIC_FORM_UNAVAILABLE;
        return read(form, config);
      },
      () => Promise.resolve(PUBLIC_FORM_UNAVAILABLE),
    );
  }
}
