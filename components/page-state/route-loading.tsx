import { getTranslations } from "next-intl/server";

import { PageContainer } from "@/components/shared/page-container";

import { PageState } from "./page-state";
import { getProtectedRouteSpec, type ProtectedRouteKey } from "./route-registry";

type Props = {
  route: ProtectedRouteKey;
};

export async function RouteLoading({ route }: Props) {
  const t = await getTranslations("PageState");
  const { skeleton } = getProtectedRouteSpec(route);
  const centered = skeleton.kind === "settings" && skeleton.view === "centered-card";
  const flush = skeleton.kind === "data-view" || skeleton.kind === "detail" || skeleton.kind === "inbox";

  return (
    <PageContainer padded={!centered && !flush}>
      <PageState
        className={centered ? "h-full flex-1" : flush ? "h-[calc(100svh-4rem)] md:h-[calc(100svh-5rem)]" : undefined}
        label={t("loading")}
        skeleton={skeleton}
        state="loading"
      />
    </PageContainer>
  );
}
