import type { PublicBlocked, PublicRateLimited } from "@/core/network/public-access";
import type { PublicTenant } from "@/core/network/public-tenant";
import type { TokenBucketRateLimiter } from "@/core/network/token-bucket-rate-limiter";
import type { PublicFormLookup, PublicFormLookupRepo } from "./public-form-lookup.repo";
import type { PublicFormConfig } from "./public-form.schema";

import { PermissionService } from "@/core/base/permission.service";
import { admitAll } from "@/core/network/public-access";
import { eventVia } from "@/features/event/event-via";
import { Action, Resource } from "@/generated/prisma";

import { publicFormIdFromToken } from "./public-form-token";
import { PublicFormConfigSchema } from "./public-form.schema";

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
    private tenant: PublicTenant,
    private limiters: PublicFormLimiters,
    private settings: Settings,
  ) {}

  now(): Date {
    return this.settings.now?.() ?? new Date();
  }

  get authSecret(): string | undefined {
    return this.settings.authSecret;
  }

  admitSubmission(formId: string): PublicRateLimited | null {
    return admitAll([[this.limiters.formSubmit, `form:${formId}`]]);
  }

  async open<T>(
    token: string,
    visitor: string | null | undefined,
    mode: PublicFormOpenMode,
    read: (form: PublicFormLookup, config: PublicFormConfig) => Promise<T | PublicBlocked>,
  ): Promise<T | PublicBlocked> {
    const formId = publicFormIdFromToken(token, this.settings.authSecret);
    if (!formId) return PUBLIC_FORM_UNAVAILABLE;

    const limited = admitAll(
      mode === "view"
        ? [[this.limiters.view, visitor ? `view:${visitor}` : null]]
        : [[this.limiters.visitorSubmit, visitor ? `submit:${formId}:${visitor}` : null]],
    );
    if (limited) return limited;

    const form = await this.lookup.findFormUnscoped(formId);
    if (!form || !form.enabled || !form.company.allowPublicLinks || form.company.deletingAt || form.type.archived)
      return PUBLIC_FORM_UNAVAILABLE;
    const config = parsePublicFormConfig(form.config);
    if (!config) return PUBLIC_FORM_UNAVAILABLE;

    return this.tenant.run(
      form.createdById,
      async () => {
        const creator = new PermissionService();
        if (creator.companyId !== form.companyId || !creator.has(Resource.publicLinks, Action.create))
          return PUBLIC_FORM_UNAVAILABLE;
        return read(form, config);
      },
      () => Promise.resolve(PUBLIC_FORM_UNAVAILABLE),
      eventVia("form", form.name),
    );
  }
}
