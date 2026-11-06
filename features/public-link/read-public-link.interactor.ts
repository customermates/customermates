import type { PublicLinkAccess } from "./public-link-access";
import type { PublicLinkRepo } from "./public-link.repo";
import type { PublicDashboard, PublicDashboardResult } from "./public-link.schema";

import { AllowInDemoMode } from "@/core/decorators/allow-in-demo-mode.decorator";
import { SystemInteractor } from "@/core/decorators/system-interactor.decorator";

import { PUBLIC_LINK_UNAVAILABLE } from "./public-link-access";
import { publicChartWidget } from "./public-link.schema";

type ListLabels = {
  invoke(): Promise<
    { ok: true; data: { types: Array<{ id: string; label: string; pluralLabel: string }> } } | { ok: false }
  >;
};

@AllowInDemoMode
@SystemInteractor
export class ReadPublicLinkInteractor {
  private readonly cache = new Map<string, { until: number; dashboard: PublicDashboard }>();

  constructor(
    private access: PublicLinkAccess,
    private links: PublicLinkRepo,
    private settings: { cacheMs?: number } = {},
    private lists?: ListLabels,
  ) {}

  invoke({ token, visitor }: { token: string; visitor?: string | null }): Promise<PublicDashboardResult> {
    return this.access.open(token, visitor, async (link): Promise<PublicDashboardResult> => {
      await this.links.recordOpen(link.id);
      const now = this.access.now().getTime();
      const cached = this.cache.get(link.id);
      if (cached && cached.until > now) return { status: "available", dashboard: cached.dashboard };

      const loaded = await this.access.charts(link);
      if (!loaded) return PUBLIC_LINK_UNAVAILABLE;
      const navigation = this.lists ? await this.lists.invoke() : null;
      const labels = new Map(
        (navigation?.ok ? navigation.data.types : []).map((type) => [
          type.id,
          { label: type.label, pluralLabel: type.pluralLabel },
        ]),
      );
      const dashboard: PublicDashboard = {
        name: link.view.name,
        workspaceName: link.company.name,
        expiresAt: link.expiresAt ? link.expiresAt.toISOString().slice(0, 10) : null,
        widgets: loaded.charts.map((widget, index) =>
          publicChartWidget(widget, index, labels.get(widget.measure.source.typeId)),
        ),
        hiddenWidgetCount: loaded.hidden,
      };
      this.cache.set(link.id, { until: now + (this.settings.cacheMs ?? 60_000), dashboard });
      if (this.cache.size > 1_000) this.cache.delete(this.cache.keys().next().value as string);
      return { status: "available", dashboard };
    });
  }
}
