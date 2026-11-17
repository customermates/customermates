import { getTranslations } from "next-intl/server";

import { ConnectedAccountsPageSkeleton } from "@/app/[locale]/(protected)/w/[workspace]/settings/(account)/components/profile-resource-page-skeleton";
import { PageState } from "@/components/page-state/page-state";
import { PageContainer } from "@/components/shared/page-container";

export default async function Loading() {
  const t = await getTranslations("PageState");
  return (
    <PageContainer>
      <PageState background={<ConnectedAccountsPageSkeleton />} label={t("loading")} state="loading" />
    </PageContainer>
  );
}
