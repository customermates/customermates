import { Resource } from "@/generated/prisma";

import { WebhookDeliveriesPageView } from "../components/webhook/webhook-deliveries-page-view";

import { getGetWebhookDeliveriesInteractor } from "@/core/di";
import { requireAccess } from "@/features/auth/next/require";
import { readSurfaceParams } from "@/core/data-view/next/read-surface-params";
import { SURFACE } from "@/core/data-view/data-view-keys";
import { PageContainer } from "@/components/shared/page-container";
import { unwrapValidated } from "@/core/validation/validation.utils";

type Props = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function CompanyWebhookDeliveriesPage({ searchParams }: Props) {
  await requireAccess({ resource: Resource.api });

  const deliveryParams = await readSurfaceParams(SURFACE.webhookDeliveries, searchParams);

  const deliveries = await unwrapValidated(getGetWebhookDeliveriesInteractor().invoke(deliveryParams));

  return (
    <PageContainer padded={false}>
      <WebhookDeliveriesPageView initialDeliveries={deliveries} />
    </PageContainer>
  );
}
