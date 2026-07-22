import { Resource } from "@/generated/prisma";

import { WebhookDeliveriesCard } from "../components/webhook/webhook-deliveries-card";

import { getGetWebhookDeliveriesInteractor } from "@/core/di";
import { requireAccess } from "@/features/auth/next/require";
import { decodeGetParams } from "@/core/utils/get-params";
import { PageContainer } from "@/components/shared/page-container";

type Props = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function CompanyWebhookDeliveriesPage({ searchParams }: Props) {
  await requireAccess({ resource: Resource.api });

  const params = await searchParams;
  const deliveryParams = decodeGetParams(params);

  const deliveries = await getGetWebhookDeliveriesInteractor().invoke({
    ...deliveryParams,
    p13nId: "webhook-deliveries-card-store",
  });

  return (
    <PageContainer padded={false}>
      <WebhookDeliveriesCard initialDeliveries={deliveries.ok ? deliveries.data : { items: [] }} />
    </PageContainer>
  );
}
