import type { GetQueryParams } from "@/core/base/base-get.schema";

import { WebhooksPageView } from "@/app/[locale]/(protected)/w/[workspace]/settings/(workspace)/components/webhook/webhooks-page-view";
import { FreePlanFeatureOverlay } from "@/app/components/upsell/free-plan-feature-overlay";
import { ConnectionScopeLine } from "@/components/connections/connection-scope-line";
import { FREE_PLAN_ID } from "@/core/commercial/plan-catalog";
import { getGetPlanUsageInteractor, getGetWebhooksInteractor } from "@/core/di";
import { unwrapPage } from "@/core/validation/next/unwrap-page";

type Props = { params: GetQueryParams };

export async function DevelopersWebhooksSection({ params }: Props) {
  const [webhooks, usage] = await Promise.all([
    unwrapPage(getGetWebhooksInteractor().invoke(params)),
    unwrapPage(getGetPlanUsageInteractor().invoke()),
  ]);
  const view = <WebhooksPageView initialWebhooks={webhooks} />;

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <div className="px-4 md:px-6">
        <ConnectionScopeLine owner="workspace" scope="webhooks" />
      </div>

      {usage.plan === FREE_PLAN_ID ? <FreePlanFeatureOverlay feature="webhooks">{view}</FreePlanFeatureOverlay> : view}
    </div>
  );
}
