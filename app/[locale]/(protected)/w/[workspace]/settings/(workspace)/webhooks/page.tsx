import { Resource } from "@/generated/prisma";

import { WebhooksPageView } from "../components/webhook/webhooks-page-view";

import {
  getGetPlanUsageInteractor,
  getGetRecordNavigationInteractor,
  getGetWebhooksInteractor,
  getManageIncomingWebhookInteractor,
} from "@/core/di";
import { FREE_PLAN_ID } from "@/core/commercial/plan-catalog";
import { FreePlanFeatureOverlay } from "@/app/components/upsell/free-plan-feature-overlay";
import { IncomingWebhooksView } from "@/components/incoming-webhook/incoming-webhooks-view";
import { WebhookTabs } from "@/components/incoming-webhook/webhook-tabs";
import { requireAccess } from "@/features/auth/next/require";
import { readSurfaceParams } from "@/core/data-view/next/read-surface-params";
import { SURFACE } from "@/core/data-view/data-view-keys";
import { PageContainer } from "@/components/shared/page-container";
import { unwrapPage } from "@/core/validation/next/unwrap-page";

type Props = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

async function incomingView() {
  const [list, navigation] = await Promise.all([
    unwrapPage(getManageIncomingWebhookInteractor().invoke({ action: "list" })),
    unwrapPage(getGetRecordNavigationInteractor().invoke()),
  ]);
  return (
    <IncomingWebhooksView
      initial={list.items ?? []}
      lists={navigation.types
        .filter((type) => type.canCreate)
        .map((type) => ({ id: type.id, label: type.pluralLabel }))}
    />
  );
}

export default async function CompanyWebhooksPage({ searchParams }: Props) {
  await requireAccess({ resource: Resource.api });

  const resolved = await searchParams;
  const incoming = resolved.tab === "incoming";
  const webhookParams = await readSurfaceParams(SURFACE.webhooks, searchParams);

  const [body, usage] = await Promise.all([
    incoming
      ? incomingView()
      : unwrapPage(getGetWebhooksInteractor().invoke(webhookParams)).then((webhooks) => (
          <WebhooksPageView initialWebhooks={webhooks} />
        )),
    unwrapPage(getGetPlanUsageInteractor().invoke()),
  ]);

  return (
    <PageContainer padded={false}>
      <WebhookTabs active={incoming ? "incoming" : "outgoing"} />

      {usage.plan === FREE_PLAN_ID ? <FreePlanFeatureOverlay feature="webhooks">{body}</FreePlanFeatureOverlay> : body}
    </PageContainer>
  );
}
