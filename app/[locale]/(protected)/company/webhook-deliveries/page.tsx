import { Resource } from "@/generated/prisma";

import { WebhookDeliveriesCard } from "../components/webhook/webhook-deliveries-card";

import { getGetWebhookDeliveriesInteractor } from "@/core/app-di";
import { requireAccess } from "@/features/auth/next/require";
import { PageContainer } from "@/components/shared/page-container";

export default async function CompanyWebhookDeliveriesPage() {
  await requireAccess({ resource: Resource.api });

  const deliveries = await getGetWebhookDeliveriesInteractor().invoke({ p13nId: "webhook-deliveries-card-store" });

  return (
    <PageContainer padded={false}>
      <WebhookDeliveriesCard initialDeliveries={deliveries.ok ? deliveries.data : { items: [] }} />
    </PageContainer>
  );
}
