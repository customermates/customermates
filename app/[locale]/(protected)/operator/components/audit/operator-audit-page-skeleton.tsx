import type { DataViewSkeletonSpec } from "@/components/data-view/data-view-skeleton";
import type { DataViewView } from "@/components/data-view/data-view-state";

import { DataViewSkeleton } from "@/components/data-view/data-view-skeleton";

type Props = { animated?: boolean; view?: DataViewView };

export function OperatorAuditPageSkeleton({ animated = true, view = "table" }: Props) {
  const spec: DataViewSkeletonSpec = view === "table" ? { tableVariant: "plain", view } : { identity: "text", view };

  return <DataViewSkeleton data-operator-audit-page-skeleton animated={animated} spec={spec} />;
}
