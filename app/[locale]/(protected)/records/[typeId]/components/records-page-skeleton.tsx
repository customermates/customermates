import { DataViewSkeleton } from "@/components/data-view/data-view-skeleton";

export function RecordsPageSkeleton({
  animated = true,
  view = "table",
}: {
  animated?: boolean;
  view?: "table" | "board";
}) {
  return (
    <DataViewSkeleton
      data-records-page-skeleton
      animated={animated}
      spec={view === "table" ? { view, tableVariant: "entity" } : { view, identity: "text" }}
    />
  );
}
