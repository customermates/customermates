import type { DataViewView } from "@/components/data-view/data-view-state";

import { DataViewSkeleton } from "@/components/data-view/data-view-skeleton";

export function RecordsPageSkeleton({ animated = true, view = "table" }: { animated?: boolean; view?: DataViewView }) {
  return (
    <DataViewSkeleton
      data-records-page-skeleton
      animated={animated}
      spec={
        view === "table" ? { view, tableVariant: "entity" } : view === "board" ? { view, identity: "text" } : { view }
      }
    />
  );
}
