import { getTranslations } from "next-intl/server";

import { Skeleton } from "@/components/ui/skeleton";

export default async function HostedAiOperatorPageStateLoading() {
  const t = await getTranslations("OperatorConsole");

  return (
    <div aria-busy="true" aria-label={t("states.loading")} className="flex flex-col gap-6" role="status">
      <div className="space-y-3">
        <Skeleton className="h-8 w-64" />

        <Skeleton className="h-4 w-full max-w-xl" />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }, (_, index) => (
          <Skeleton key={index} className="h-32 rounded-xl" />
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Skeleton className="h-80 rounded-xl" />

        <Skeleton className="h-80 rounded-xl" />
      </div>
    </div>
  );
}
