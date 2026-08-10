import { Resource } from "@/generated/prisma";

import { WebhooksCard } from "../components/webhook/webhooks-card";

import { getGetWebhooksInteractor } from "@/core/di";
import { requireAccess } from "@/features/auth/next/require";
import { decodeGetParams } from "@/core/utils/get-params";
import { PageContainer } from "@/components/shared/page-container";
import { unwrapValidated } from "@/core/validation/validation.utils";

type Props = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function CompanyWebhooksPage({ searchParams }: Props) {
  await requireAccess({ resource: Resource.api });

  const params = await searchParams;
  const webhookParams = decodeGetParams(params);

  const webhooks = await unwrapValidated(
    getGetWebhooksInteractor().invoke({ ...webhookParams, p13nId: "webhooks-card-store" }),
  );

  return (
    <PageContainer padded={false}>
      <WebhooksCard initialWebhooks={webhooks} />
    </PageContainer>
  );
}
