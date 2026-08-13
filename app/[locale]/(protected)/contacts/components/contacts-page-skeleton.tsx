import type { DataViewSkeletonSpec } from "@/components/data-view/data-view-skeleton";
import type { DataViewView } from "@/components/data-view/data-view-state";

import { DataViewSkeleton } from "@/components/data-view/data-view-skeleton";

type Props = {
  animated?: boolean;
  view?: DataViewView;
};

export function ContactsPageSkeleton({ animated = true, view = "table" }: Props) {
  const spec: DataViewSkeletonSpec =
    view === "table" ? { tableVariant: "contact", view } : { identity: "avatar", view };

  return <DataViewSkeleton data-contacts-page-skeleton animated={animated} spec={spec} />;
}
