import { Resource } from "@/generated/prisma";

import { WebhookDeliveriesPageView } from "../components/webhook/webhook-deliveries-page-view";

import { getGetWebhookDeliveriesInteractor } from "@/core/di";
import { requireAccess } from "@/features/auth/next/require";
import { decodeGetParams } from "@/core/utils/get-params";
import { PageContainer } from "@/components/shared/page-container";
import { unwrapValidated } from "@/core/validation/validation.utils";

type Props = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function CompanyWebhookDeliveriesPage({ searchParams }: Props) {
  await requireAccess({ resource: Resource.api });

  const params = await searchParams;
  const deliveryParams = decodeGetParams(params);

  const deliveries = await unwrapValidated(
    getGetWebhookDeliveriesInteractor().invoke({
      ...deliveryParams,
      p13nId: "webhook-deliveries-card-store",
    }),
  );

  return (
    <PageContainer padded={false}>
      <WebhookDeliveriesPageView initialDeliveries={deliveries} />
    </PageContainer>
  );
}
