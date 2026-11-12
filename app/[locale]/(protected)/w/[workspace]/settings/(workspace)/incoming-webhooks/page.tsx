import { Resource } from "@/generated/prisma";

import {
  getGetPlanUsageInteractor,
  getGetRecordNavigationInteractor,
  getManageIncomingWebhookInteractor,
} from "@/core/di";
import { FREE_PLAN_ID } from "@/core/commercial/plan-catalog";
import { FreePlanFeatureOverlay } from "@/app/components/upsell/free-plan-feature-overlay";
import { IncomingWebhooksView } from "@/components/incoming-webhook/incoming-webhooks-view";
import { requireAccess } from "@/features/auth/next/require";
import { PageContainer } from "@/components/shared/page-container";
import { unwrapPage } from "@/core/validation/next/unwrap-page";

export default async function CompanyIncomingWebhooksPage() {
  await requireAccess({ resource: Resource.api });

  const [list, navigation, usage] = await Promise.all([
    unwrapPage(getManageIncomingWebhookInteractor().invoke({ action: "list" })),
    unwrapPage(getGetRecordNavigationInteractor().invoke()),
    unwrapPage(getGetPlanUsageInteractor().invoke()),
  ]);

  const body = (
    <IncomingWebhooksView
      initial={list.items ?? []}
      lists={navigation.types
        .filter((type) => type.canCreate)
        .map((type) => ({ id: type.id, label: type.pluralLabel }))}
    />
  );

  return (
    <PageContainer padded={false}>
      {usage.plan === FREE_PLAN_ID ? <FreePlanFeatureOverlay feature="webhooks">{body}</FreePlanFeatureOverlay> : body}
    </PageContainer>
  );
}
