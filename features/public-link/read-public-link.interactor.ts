import type { RecordWidgetDto } from "@/features/widget/record-widget.schema";
import type { WidgetDto } from "@/features/widget/widget.schema";
import type { PublicLinkLookupRepo } from "./public-link-lookup.repo";
import type { PublicLinkRateLimiter } from "./public-link-rate-limiter";
import type { PublicLinkTenant } from "./public-link-tenant";
import type { PublicLinkRepo } from "./public-link.repo";
import type { PublicDashboard, PublicDashboardResult } from "./public-link.schema";

import { PermissionService } from "@/core/base/permission.service";
import { SURFACE } from "@/core/data-view/data-view-keys";
import { SystemInteractor } from "@/core/decorators/system-interactor.decorator";
import { Action, Resource } from "@/generated/prisma";

import { publicLinkIdFromToken } from "./public-link-token";
import { publicChartWidget } from "./public-link.schema";

type WidgetReader = {
  invoke(data: { viewId: string }): Promise<{ ok: true; data: { items: WidgetDto[]; activeViewKey: string } }>;
};

type Settings = { authSecret: string | undefined; cacheMs?: number; now?: () => Date };

const UNAVAILABLE = { status: "unavailable" } as const;

@SystemInteractor
export class ReadPublicLinkInteractor {
  private readonly cache = new Map<string, { until: number; dashboard: PublicDashboard }>();

  constructor(
    private lookup: PublicLinkLookupRepo,
    private links: PublicLinkRepo,
    private tenant: PublicLinkTenant,
    private widgets: WidgetReader,
    private perLink: PublicLinkRateLimiter,
    private perVisitor: PublicLinkRateLimiter,
    private settings: Settings,
  ) {}

  async invoke({ token, visitor }: { token: string; visitor?: string | null }): Promise<PublicDashboardResult> {
    const linkId = publicLinkIdFromToken(token, this.settings.authSecret);
    if (!linkId) return UNAVAILABLE;

    for (const [limiter, key] of [
      [this.perVisitor, visitor ? `visitor:${visitor}` : null],
      [this.perLink, `link:${linkId}`],
    ] as const) {
      if (!key) continue;
      const admission = limiter.admit(key);
      if (!admission.allowed) return { status: "rateLimited", retryAfterSeconds: admission.retryAfterSeconds };
    }

    const link = await this.lookup.findLinkUnscoped(linkId);
    const now = this.settings.now?.() ?? new Date();
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
      return UNAVAILABLE;

    return this.tenant.run(
      link.createdById,
      async (): Promise<PublicDashboardResult> => {
        const creator = new PermissionService();
        if (creator.companyId !== link.companyId || !creator.has(Resource.publicLinks, Action.create))
          return UNAVAILABLE;
        await this.links.recordOpen(link.id);
        const cached = this.cache.get(link.id);
        if (cached && cached.until > now.getTime())
          return { status: "available" as const, dashboard: cached.dashboard };

        const result = await this.widgets.invoke({ viewId: link.viewId });
        if (result.data.activeViewKey !== link.viewId) return UNAVAILABLE;
        const charts = result.data.items.filter((widget): widget is RecordWidgetDto => widget.kind === "chart");
        const dashboard: PublicDashboard = {
          name: link.view.name,
          workspaceName: link.company.name,
          expiresAt: link.expiresAt ? link.expiresAt.toISOString().slice(0, 10) : null,
          widgets: charts.map(publicChartWidget),
          hiddenWidgetCount: result.data.items.length - charts.length,
        };
        this.cache.set(link.id, { until: now.getTime() + (this.settings.cacheMs ?? 60_000), dashboard });
        if (this.cache.size > 1_000) this.cache.delete(this.cache.keys().next().value as string);
        return { status: "available" as const, dashboard };
      },
      () => Promise.resolve(UNAVAILABLE),
    );
  }
}
