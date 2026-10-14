import { DataViewSkeleton } from "@/components/data-view/data-view-skeleton";

export function TrashPageSkeleton({ animated = true }: { animated?: boolean }) {
  return (
    <DataViewSkeleton data-trash-page-skeleton animated={animated} spec={{ tableVariant: "plain", view: "table" }} />
  );
}
