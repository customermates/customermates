import { getTranslations } from "next-intl/server";

import { PageState } from "@/components/page-state/page-state";
import { LegalUpdatePageSkeleton } from "./components/legal-update-page-skeleton";

export default async function Loading() {
  const t = await getTranslations("PageState");
  return (
    <PageState
      background={<LegalUpdatePageSkeleton />}
      className="h-full flex-1"
      label={t("loading")}
      state="loading"
    />
  );
}
