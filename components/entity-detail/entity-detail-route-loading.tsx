import { getTranslations } from "next-intl/server";

import { PageState } from "@/components/page-state/page-state";

import { EntityDetailPageSkeleton } from "./entity-detail-page-skeleton";

export async function EntityDetailRouteLoading() {
  const t = await getTranslations("PageState");
  return (
    <PageState
      background={<EntityDetailPageSkeleton />}
      className="h-[calc(100svh-4rem)] md:h-[calc(100svh-5rem)]"
      label={t("loading")}
      state="loading"
    />
  );
}
