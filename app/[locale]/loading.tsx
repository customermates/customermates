import { getTranslations } from "next-intl/server";

import { Spinner } from "@/components/ui/spinner";

export default async function Loading() {
  const t = await getTranslations();

  return (
    <div className="flex min-h-0 w-full flex-1 items-center justify-center">
      <Spinner aria-label={t("Loading.text")} className="text-muted-foreground motion-reduce:animate-none" size="lg" />
    </div>
  );
}
