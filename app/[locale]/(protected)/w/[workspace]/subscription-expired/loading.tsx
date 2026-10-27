import { getTranslations } from "next-intl/server";

import { PageState } from "@/components/page-state/page-state";
import { SubscriptionExpiredPageSkeleton } from "./components/subscription-expired-page-skeleton";

export default async function Loading() {
  const t = await getTranslations("PageState");
  return (
    <PageState
      background={<SubscriptionExpiredPageSkeleton />}
      className="h-full flex-1"
      label={t("loading")}
      state="loading"
    />
  );
}
