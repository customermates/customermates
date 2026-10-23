import { PageContainer } from "@/components/shared/page-container";
import { EntityDetailRouteLoading } from "@/components/entity-detail/entity-detail-route-loading";

export default function Loading() {
  return (
    <PageContainer padded={false}>
      <EntityDetailRouteLoading />
    </PageContainer>
  );
}
