import { getTranslations } from "next-intl/server";

import { Skeleton } from "@/components/ui/skeleton";

export default async function OperatorUsersPageStateLoading() {
  const t = await getTranslations("OperatorUsers");

  return (
    <div aria-busy="true" aria-label={t("states.loading")} className="flex flex-col gap-6" role="status">
      <div className="space-y-3">
        <Skeleton className="h-8 w-56" />

        <Skeleton className="h-4 w-full max-w-2xl" />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }, (_, index) => (
          <Skeleton key={index} className="h-28 rounded-xl" />
        ))}
      </div>

      <Skeleton className="h-96 rounded-xl" />
    </div>
  );
}
