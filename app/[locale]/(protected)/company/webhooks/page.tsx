import { Resource } from "@/generated/prisma";

import { WebhooksPageView } from "../components/webhook/webhooks-page-view";

import { getGetWebhooksInteractor } from "@/core/di";
import { requireAccess } from "@/features/auth/next/require";
import { readSurfaceParams } from "@/core/data-view/next/read-surface-params";
import { SURFACE } from "@/core/data-view/data-view-keys";
import { PageContainer } from "@/components/shared/page-container";
import { unwrapValidated } from "@/core/validation/validation.utils";

type Props = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function CompanyWebhooksPage({ searchParams }: Props) {
  await requireAccess({ resource: Resource.api });

  const webhookParams = await readSurfaceParams(SURFACE.webhooks, searchParams);

  const webhooks = await unwrapValidated(getGetWebhooksInteractor().invoke(webhookParams));

  return (
    <PageContainer padded={false}>
      <WebhooksPageView initialWebhooks={webhooks} />
    </PageContainer>
  );
}
