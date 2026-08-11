import type { DataViewSkeletonSpec } from "@/components/data-view/data-view-skeleton";
import type { DataViewView } from "@/components/data-view/data-view-state";

import { DataViewSkeleton } from "@/components/data-view/data-view-skeleton";

type Props = {
  animated?: boolean;
  view?: DataViewView;
};

export function OrganizationsPageSkeleton({ animated = true, view = "table" }: Props) {
  const spec: DataViewSkeletonSpec = view === "table" ? { tableVariant: "entity", view } : { identity: "text", view };

  return (
    <div
      data-organizations-page-skeleton
      aria-hidden="true"
      className="size-full min-h-0"
      data-page-skeleton-empty={!animated || undefined}
      data-page-skeleton-loading={animated || undefined}
      data-skeleton-kind="data-view"
      data-skeleton-variant={view === "table" ? "entity" : "text"}
      data-skeleton-view={view}
    >
      <DataViewSkeleton animated={animated} spec={spec} />
    </div>
  );
}
