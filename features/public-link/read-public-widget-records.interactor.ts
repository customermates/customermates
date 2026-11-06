import type { GetQueryParams } from "@/core/base/base-get.schema";
import type { Validated } from "@/core/validation/validation.utils";
import type { RecordPresentationResult } from "@/features/records/get-record-presentation.interactor";
import type { PublicLinkAccess } from "./public-link-access";
import type { PublicWidgetRecordsInput, PublicWidgetRecordsResult } from "./public-link.schema";

import equal from "fast-deep-equal";

import { ViewMode } from "@/core/base/base-query-builder";
import { ALL_VIEW_KEY } from "@/core/data-view/data-view-keys";
import { DEFAULT_DATA_VIEW_PAGE_SIZE, type DATA_VIEW_PAGE_SIZES } from "@/core/data-view/data-view-state.schema";
import { AllowInDemoMode } from "@/core/decorators/allow-in-demo-mode.decorator";
import { SystemInteractor } from "@/core/decorators/system-interactor.decorator";
import { recordContributionFilter } from "@/features/records/record-contribution-link";

import { PUBLIC_LINK_UNAVAILABLE } from "./public-link-access";
import { PublicWidgetRecordsSchema } from "./public-link.schema";

type DataViewPageSize = (typeof DATA_VIEW_PAGE_SIZES)[number];

type Presentation = {
  invoke(input: { typeId: string; params: GetQueryParams }): Validated<RecordPresentationResult>;
};

@AllowInDemoMode
@SystemInteractor
export class ReadPublicWidgetRecordsInteractor {
  constructor(
    private access: PublicLinkAccess,
    private presentation: Presentation,
  ) {}

  async invoke(raw: PublicWidgetRecordsInput & { visitor?: string | null }): Promise<PublicWidgetRecordsResult> {
    const { visitor, ...rest } = raw;
    const parsed = PublicWidgetRecordsSchema.safeParse(rest);
    if (!parsed.success) return PUBLIC_LINK_UNAVAILABLE;
    const input = parsed.data;

    return this.access.open(input.token, visitor, async (link): Promise<PublicWidgetRecordsResult> => {
      const loaded = await this.access.charts(link);
      const chart = loaded?.charts[input.widget];
      if (!chart || chart.status !== "ready" || !chart.data) return PUBLIC_LINK_UNAVAILABLE;
      const groups = chart.data.groups.map(({ record, label }) => ({ record, label }));
      if (input.group && !groups.some((group) => equal(group, input.group))) return PUBLIC_LINK_UNAVAILABLE;

      const filter = recordContributionFilter({
        measure: chart.measure,
        group: input.group,
        title: chart.name,
        groupLabel: input.label,
      });
      const result = await this.presentation.invoke({
        typeId: chart.measure.source.typeId,
        params: {
          filters: [filter],
          searchTerm: "",
          viewMode: ViewMode.table,
          grouping: null,
          page: input.page,
          pageSize: (input.pageSize ?? DEFAULT_DATA_VIEW_PAGE_SIZE) as DataViewPageSize,
          viewId: ALL_VIEW_KEY,
          ...(input.sortDescriptor ? { sortDescriptor: input.sortDescriptor } : {}),
        },
      });
      if (!result.ok) return PUBLIC_LINK_UNAVAILABLE;
      return {
        status: "available",
        presentation: { ...result.data, canManageSchema: false, permittedActions: [], formulaReferences: undefined },
      };
    });
  }
}
