import type { DataViewSkeletonSpec } from "@/components/data-view/data-view-skeleton";

import { DataViewSkeleton } from "@/components/data-view/data-view-skeleton";

type Props = {
  animated?: boolean;
  view?: "table" | "cards" | "board";
};

export function ContactsPageSkeleton({ animated = true, view = "table" }: Props) {
  const spec: DataViewSkeletonSpec =
    view === "table" ? { tableVariant: "contact", view } : { identity: "avatar", view };

  return (
    <div
      data-contacts-page-skeleton
      aria-hidden="true"
      className="size-full min-h-0"
      data-page-skeleton-empty={!animated || undefined}
      data-page-skeleton-loading={animated || undefined}
      data-skeleton-kind="data-view"
      data-skeleton-variant={view === "table" ? "contact" : "avatar"}
      data-skeleton-view={view}
    >
      <DataViewSkeleton animated={animated} spec={spec} />
    </div>
  );
}
