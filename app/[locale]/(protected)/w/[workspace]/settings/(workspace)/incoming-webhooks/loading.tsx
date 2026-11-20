import { getTranslations } from "next-intl/server";

import { IncomingWebhooksPageSkeleton } from "@/components/incoming-webhook/incoming-webhooks-page-skeleton";
import { PageState } from "@/components/page-state/page-state";
import { PageContainer } from "@/components/shared/page-container";

export default async function Loading() {
  const t = await getTranslations("PageState");
  return (
    <PageContainer padded={false}>
      <PageState
        background={<IncomingWebhooksPageSkeleton />}
        className="h-[calc(100svh-6.75rem)] md:h-[calc(100svh-7.75rem)]"
        label={t("loading")}
        state="loading"
      />
    </PageContainer>
  );
}
