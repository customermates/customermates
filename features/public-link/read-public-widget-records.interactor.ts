import type { RecordWidgetDto } from "@/features/widget/record-widget.schema";
import type { PublicLinkAccess } from "./public-link-access";
import type { RecordPresentationReader } from "./public-list-reader";
import type { PublicWidgetRecordsInput, PublicWidgetRecordsResult } from "./public-link.schema";

import equal from "fast-deep-equal";

import { ALL_VIEW_KEY } from "@/core/data-view/data-view-keys";
import { DEFAULT_DATA_VIEW_PAGE_SIZE } from "@/core/data-view/data-view-state.schema";
import { AllowInDemoMode } from "@/core/decorators/allow-in-demo-mode.decorator";
import { SystemInteractor } from "@/core/decorators/system-interactor.decorator";
import { recordContributionFilter } from "@/features/records/record-contribution-link";

import { PUBLIC_LINK_UNAVAILABLE } from "./public-link-access";
import { readPublicRecords } from "./public-list-reader";
import { PublicWidgetRecordsSchema } from "./public-link.schema";

function chartColumns(measure: RecordWidgetDto["measure"]): string[] {
  const grouped = measure.groupBy && measure.groupBy.path.length === 0 ? measure.groupBy.fieldId : null;
  return [grouped, measure.valueFieldId].filter((id): id is string => Boolean(id));
}

@AllowInDemoMode
@SystemInteractor
export class ReadPublicWidgetRecordsInteractor {
  constructor(
    private access: PublicLinkAccess,
    private presentation: RecordPresentationReader,
  ) {}

  async invoke(raw: PublicWidgetRecordsInput & { visitor?: string | null }): Promise<PublicWidgetRecordsResult> {
    const { visitor, ...rest } = raw;
    const parsed = PublicWidgetRecordsSchema.safeParse(rest);
    if (!parsed.success) return PUBLIC_LINK_UNAVAILABLE;
    const input = parsed.data;

    return this.access.open(input.token, visitor, async (link): Promise<PublicWidgetRecordsResult> => {
      const loaded = await this.access.charts(link);
      const chart = loaded?.charts.find((entry) => entry.key === input.widget)?.widget;
      if (!chart || chart.status !== "ready" || !chart.data) return PUBLIC_LINK_UNAVAILABLE;
      const groups = chart.data.groups.map(({ record, label }) => ({ record, label }));
      if (input.group && !groups.some((group) => equal(group, input.group))) return PUBLIC_LINK_UNAVAILABLE;

      const filter = recordContributionFilter({
        measure: chart.measure,
        group: input.group,
        title: chart.name,
        groupLabel: input.label,
      });
      const records = await readPublicRecords(
        this.presentation,
        chart.measure.source.typeId,
        { filters: [filter], searchTerm: "", viewId: ALL_VIEW_KEY },
        {
          page: input.page,
          pageSize: input.pageSize ?? DEFAULT_DATA_VIEW_PAGE_SIZE,
          sortDescriptor: input.sortDescriptor,
          filters: input.filters,
          searchTerm: input.searchTerm,
          onlyColumns: chartColumns(chart.measure),
        },
        ALL_VIEW_KEY,
      );
      return records ? { status: "available", ...records } : PUBLIC_LINK_UNAVAILABLE;
    });
  }
}
