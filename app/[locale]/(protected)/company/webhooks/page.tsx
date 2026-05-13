import { Resource } from "@/generated/prisma";

import { WebhooksCard } from "../components/webhook/webhooks-card";

import { getGetWebhooksInteractor, getRouteGuardService } from "@/core/app-di";
import { decodeGetParams } from "@/core/utils/get-params";
import { PageContainer } from "@/components/shared/page-container";

type Props = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function CompanyWebhooksPage({ searchParams }: Props) {
  await getRouteGuardService().ensureAccessOrRedirect({ resource: Resource.api });

  const params = await searchParams;
  const webhookParams = decodeGetParams(params);

  const webhooks = await getGetWebhooksInteractor().invoke({ ...webhookParams, p13nId: "webhooks-card-store" });

  return (
    <PageContainer padded={false}>
      <WebhooksCard initialWebhooks={webhooks.ok ? webhooks.data : { items: [] }} />
    </PageContainer>
  );
}
