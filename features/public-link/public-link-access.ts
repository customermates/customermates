import type { RecordWidgetDto } from "@/features/widget/record-widget.schema";
import type { WidgetDto } from "@/features/widget/widget.schema";
import type { PublicLinkLookup, PublicLinkLookupRepo } from "./public-link-lookup.repo";
import type { PublicLinkRateLimiter } from "./public-link-rate-limiter";
import type { PublicLinkTenant } from "./public-link-tenant";

import { PermissionService } from "@/core/base/permission.service";
import { SURFACE } from "@/core/data-view/data-view-keys";
import { Action, Resource } from "@/generated/prisma";

import { publicLinkIdFromToken } from "./public-link-token";

export type WidgetReader = {
  invoke(data: { viewId: string }): Promise<{ ok: true; data: { items: WidgetDto[]; activeViewKey: string } }>;
};

export type PublicLinkBlocked = { status: "unavailable" } | { status: "rateLimited"; retryAfterSeconds: number };

export const PUBLIC_LINK_UNAVAILABLE = { status: "unavailable" } as const;

type Settings = { authSecret: string | undefined; now?: () => Date };

export class PublicLinkAccess {
  constructor(
    private lookup: PublicLinkLookupRepo,
    private tenant: PublicLinkTenant,
    private widgets: WidgetReader,
    private perLink: PublicLinkRateLimiter,
    private perVisitor: PublicLinkRateLimiter,
    private settings: Settings,
  ) {}

  now(): Date {
    return this.settings.now?.() ?? new Date();
  }

  async open<T>(
    token: string,
    visitor: string | null | undefined,
    read: (link: PublicLinkLookup) => Promise<T | PublicLinkBlocked>,
  ): Promise<T | PublicLinkBlocked> {
    const linkId = publicLinkIdFromToken(token, this.settings.authSecret);
    if (!linkId) return PUBLIC_LINK_UNAVAILABLE;

    for (const [limiter, key] of [
      [this.perVisitor, visitor ? `visitor:${visitor}` : null],
      [this.perLink, `link:${linkId}`],
    ] as const) {
      if (!key) continue;
      const admission = limiter.admit(key);
      if (!admission.allowed) return { status: "rateLimited", retryAfterSeconds: admission.retryAfterSeconds };
    }

    const link = await this.lookup.findLinkUnscoped(linkId);
    const now = this.now();
    if (
      !link ||
      link.revokedAt ||
      (link.expiresAt && link.expiresAt <= now) ||
      !link.company.allowPublicLinks ||
      link.company.deletingAt ||
      link.view.deletedAt ||
      link.view.surfaceKey !== SURFACE.dashboard ||
      link.view.userId !== link.createdById
    )
      return PUBLIC_LINK_UNAVAILABLE;

    return this.tenant.run(
      link.createdById,
      async () => {
        const creator = new PermissionService();
        if (creator.companyId !== link.companyId || !creator.has(Resource.publicLinks, Action.create))
          return PUBLIC_LINK_UNAVAILABLE;
        return read(link);
      },
      () => Promise.resolve(PUBLIC_LINK_UNAVAILABLE),
    );
  }

  async charts(link: PublicLinkLookup): Promise<{ charts: RecordWidgetDto[]; hidden: number } | null> {
    const result = await this.widgets.invoke({ viewId: link.viewId });
    if (result.data.activeViewKey !== link.viewId) return null;
    const charts = result.data.items.filter((widget): widget is RecordWidgetDto => widget.kind === "chart");
    return { charts, hidden: result.data.items.length - charts.length };
  }
}
