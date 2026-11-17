import type { GetQueryParams } from "@/core/base/base-get.schema";

import { FreePlanFeatureOverlay } from "@/app/components/upsell/free-plan-feature-overlay";
import { ConnectionScopeLine } from "@/components/connections/connection-scope-line";
import { IncomingWebhooksPageView } from "@/components/incoming-webhook/incoming-webhooks-page-view";
import { FREE_PLAN_ID } from "@/core/commercial/plan-catalog";
import {
  getGetIncomingWebhooksInteractor,
  getGetPlanUsageInteractor,
  getGetRecordNavigationInteractor,
} from "@/core/di";
import { unwrapPage } from "@/core/validation/next/unwrap-page";

type Props = { params: GetQueryParams };

export async function DevelopersIncomingSection({ params }: Props) {
  const [webhooks, navigation, usage] = await Promise.all([
    unwrapPage(getGetIncomingWebhooksInteractor().invoke(params)),
    unwrapPage(getGetRecordNavigationInteractor().invoke()),
    unwrapPage(getGetPlanUsageInteractor().invoke()),
  ]);

  const view = (
    <IncomingWebhooksPageView
      initialWebhooks={webhooks}
      lists={navigation.types
        .filter((type) => type.canCreate)
        .map((type) => ({ id: type.id, label: type.pluralLabel }))}
    />
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <div className="px-4 md:px-6">
        <ConnectionScopeLine owner="workspace" scope="incoming" />
      </div>

      {usage.plan === FREE_PLAN_ID ? <FreePlanFeatureOverlay feature="webhooks">{view}</FreePlanFeatureOverlay> : view}
    </div>
  );
}
