import type { RecordWidgetDto } from "@/features/widget/record-widget.schema";
import type { WidgetDto } from "@/features/widget/widget.schema";
import type { PublicLinkLookup, PublicLinkLookupRepo } from "./public-link-lookup.repo";
import type { TokenBucketRateLimiter } from "@/core/network/token-bucket-rate-limiter";
import type { PublicLinkTenant } from "./public-link-tenant";

import { createHash } from "node:crypto";

import { PermissionService } from "@/core/base/permission.service";
import { SURFACE } from "@/core/data-view/data-view-keys";
import { Action, Resource } from "@/generated/prisma";

import { isPublishableSurface } from "./public-link-surface";
import { publicLinkIdFromToken } from "./public-link-token";

export type WidgetReader = {
  invoke(data: { viewId: string }): Promise<{ ok: true; data: { items: WidgetDto[]; activeViewKey: string } }>;
};

export type PublicLinkBlocked = { status: "unavailable" } | { status: "rateLimited"; retryAfterSeconds: number };

export const PUBLIC_LINK_UNAVAILABLE = { status: "unavailable" } as const;

type Settings = { authSecret: string | undefined; now?: () => Date; chartCacheMs?: number };

export type PublicCharts = { charts: Array<{ key: string; widget: RecordWidgetDto }>; hidden: number };

export function publicWidgetKey(linkId: string, widgetId: string): string {
  return createHash("sha256").update(`public-widget:${linkId}:${widgetId}`).digest("hex").slice(0, 16);
}

export class PublicLinkAccess {
  private readonly chartCache = new Map<string, { until: number; charts: PublicCharts }>();

  constructor(
    private lookup: PublicLinkLookupRepo,
    private tenant: PublicLinkTenant,
    private widgets: WidgetReader,
    private perLink: TokenBucketRateLimiter,
    private perVisitor: TokenBucketRateLimiter,
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
      !isPublishableSurface(link.view.surfaceKey) ||
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

  async charts(link: PublicLinkLookup): Promise<PublicCharts | null> {
    if (link.view.surfaceKey !== SURFACE.dashboard) return null;
    const now = this.now().getTime();
    const cached = this.chartCache.get(link.id);
    if (cached && cached.until > now) return cached.charts;
    const result = await this.widgets.invoke({ viewId: link.viewId });
    if (result.data.activeViewKey !== link.viewId) return null;
    const charts = result.data.items.filter((widget): widget is RecordWidgetDto => widget.kind === "chart");
    const loaded = {
      charts: charts.map((widget) => ({ key: publicWidgetKey(link.id, widget.id), widget })),
      hidden: result.data.items.length - charts.length,
    };
    const ttl = this.settings.chartCacheMs ?? 60_000;
    if (ttl > 0) {
      this.chartCache.set(link.id, { until: now + ttl, charts: loaded });
      if (this.chartCache.size > 1_000) this.chartCache.delete(this.chartCache.keys().next().value as string);
    }
    return loaded;
  }
}
