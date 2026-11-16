import { Resource } from "@/generated/prisma";

import {
  getGetIncomingWebhooksInteractor,
  getGetPlanUsageInteractor,
  getGetRecordNavigationInteractor,
} from "@/core/di";
import { FREE_PLAN_ID } from "@/core/commercial/plan-catalog";
import { FreePlanFeatureOverlay } from "@/app/components/upsell/free-plan-feature-overlay";
import { IncomingWebhooksPageView } from "@/components/incoming-webhook/incoming-webhooks-page-view";
import { requireAccess } from "@/features/auth/next/require";
import { readSurfaceParams } from "@/core/data-view/next/read-surface-params";
import { SURFACE } from "@/core/data-view/data-view-keys";
import { PageContainer } from "@/components/shared/page-container";
import { unwrapPage } from "@/core/validation/next/unwrap-page";

type Props = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function CompanyIncomingWebhooksPage({ searchParams }: Props) {
  await requireAccess({ resource: Resource.api });

  const webhookParams = await readSurfaceParams(SURFACE.incomingWebhooks, searchParams);

  const [webhooks, navigation, usage] = await Promise.all([
    unwrapPage(getGetIncomingWebhooksInteractor().invoke(webhookParams)),
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
    <PageContainer padded={false}>
      {usage.plan === FREE_PLAN_ID ? <FreePlanFeatureOverlay feature="webhooks">{view}</FreePlanFeatureOverlay> : view}
    </PageContainer>
  );
}
