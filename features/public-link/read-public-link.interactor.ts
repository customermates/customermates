import type { PublicLinkAccess } from "./public-link-access";
import type { PublicLinkRepo } from "./public-link.repo";
import type { PublicDashboard, PublicDashboardResult } from "./public-link.schema";
import type { RecordPresentationReader } from "./public-list-reader";

import { AllowInDemoMode } from "@/core/decorators/allow-in-demo-mode.decorator";
import { SystemInteractor } from "@/core/decorators/system-interactor.decorator";
import { recordSurfaceTypeId } from "@/core/data-view/data-view-keys";

import { PUBLIC_LINK_UNAVAILABLE } from "./public-link-access";
import { publicChartWidget } from "./public-link.schema";
import { publicListPage } from "./public-list-reader";

type ListLabels = {
  invoke(): Promise<
    { ok: true; data: { types: Array<{ id: string; label: string; pluralLabel: string }> } } | { ok: false }
  >;
};

@AllowInDemoMode
@SystemInteractor
export class ReadPublicLinkInteractor {
  constructor(
    private access: PublicLinkAccess,
    private links: PublicLinkRepo,
    private lists?: ListLabels,
    private presentation?: RecordPresentationReader,
  ) {}

  invoke({ token, visitor }: { token: string; visitor?: string | null }): Promise<PublicDashboardResult> {
    return this.access.open(token, visitor, async (link): Promise<PublicDashboardResult> => {
      await this.links.recordOpen(link.id);
      const typeId = recordSurfaceTypeId(link.view.surfaceKey);
      if (typeId) {
        const records = this.presentation
          ? await publicListPage(this.presentation, typeId, link.viewId, { page: 1 })
          : null;
        if (!records) return PUBLIC_LINK_UNAVAILABLE;
        return {
          status: "available",
          list: {
            name: link.view.name,
            workspaceName: link.company.name,
            expiresAt: link.expiresAt ? link.expiresAt.toISOString().slice(0, 10) : null,
            presentation: records.presentation,
            searchable: records.searchable,
          },
        };
      }
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
        widgets: loaded.charts.map(({ key, widget }) =>
          publicChartWidget(widget, key, labels.get(widget.measure.source.typeId)),
        ),
        hiddenWidgetCount: loaded.hidden,
      };
      return { status: "available", dashboard };
    });
  }
}
