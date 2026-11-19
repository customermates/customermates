import { Resource } from "@/generated/prisma";

import { WebhooksPageView } from "../components/webhook/webhooks-page-view";

import { getGetPlanUsageInteractor, getGetWebhooksInteractor } from "@/core/di";
import { FREE_PLAN_ID } from "@/core/commercial/plan-catalog";
import { FreePlanFeatureOverlay } from "@/app/components/upsell/free-plan-feature-overlay";
import { requireAccess } from "@/features/auth/next/require";
import { readSurfaceParams } from "@/core/data-view/next/read-surface-params";
import { SURFACE } from "@/core/data-view/data-view-keys";
import { PageContainer } from "@/components/shared/page-container";
import { unwrapPage } from "@/core/validation/next/unwrap-page";

type Props = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function CompanyWebhooksPage({ searchParams }: Props) {
  await requireAccess({ resource: Resource.api });

  const webhookParams = await readSurfaceParams(SURFACE.webhooks, searchParams);

  const [webhooks, usage] = await Promise.all([
    unwrapPage(getGetWebhooksInteractor().invoke(webhookParams)),
    unwrapPage(getGetPlanUsageInteractor().invoke()),
  ]);
  const view = <WebhooksPageView initialWebhooks={webhooks} />;

  return (
    <PageContainer padded={false}>
      {usage.plan === FREE_PLAN_ID ? <FreePlanFeatureOverlay feature="webhooks">{view}</FreePlanFeatureOverlay> : view}
    </PageContainer>
  );
}
