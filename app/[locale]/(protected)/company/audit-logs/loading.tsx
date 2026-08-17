import { getTranslations } from "next-intl/server";

import { PageState } from "@/components/page-state/page-state";
import { PageContainer } from "@/components/shared/page-container";
import { AuditLogsPageSkeleton } from "../components/audit-log/audit-logs-page-skeleton";

export default async function Loading() {
  const t = await getTranslations("PageState");
  return (
    <PageContainer padded={false}>
      <PageState
        background={<AuditLogsPageSkeleton />}
        className="h-[calc(100svh-4rem)] md:h-[calc(100svh-5rem)]"
        label={t("loading")}
        state="loading"
      />
    </PageContainer>
  );
}
