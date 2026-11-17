import type { GetQueryParams } from "@/core/base/base-get.schema";

import { WebhookDeliveriesPageView } from "@/app/[locale]/(protected)/w/[workspace]/settings/(workspace)/components/webhook/webhook-deliveries-page-view";
import { ConnectionScopeLine } from "@/components/connections/connection-scope-line";
import { getGetWebhookDeliveriesInteractor } from "@/core/di";
import { unwrapPage } from "@/core/validation/next/unwrap-page";

type Props = { params: GetQueryParams };

export async function DevelopersDeliveriesSection({ params }: Props) {
  const deliveries = await unwrapPage(getGetWebhookDeliveriesInteractor().invoke(params));

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <div className="px-4 md:px-6">
        <ConnectionScopeLine owner="workspace" scope="deliveries" />
      </div>

      <WebhookDeliveriesPageView initialDeliveries={deliveries} />
    </div>
  );
}
