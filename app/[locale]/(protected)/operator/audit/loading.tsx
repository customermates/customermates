import { getTranslations } from "next-intl/server";

import { Skeleton } from "@/components/ui/skeleton";

export default async function OperatorAuditPageStateLoading() {
  const t = await getTranslations("OperatorAudit");

  return (
    <div aria-busy="true" aria-label={t("loading")} className="flex flex-col gap-6" role="status">
      <div className="space-y-3">
        <Skeleton className="h-8 w-56" />

        <Skeleton className="h-4 w-full max-w-2xl" />
      </div>

      <Skeleton className="h-96 rounded-xl" />
    </div>
  );
}
