import { getTranslations } from "next-intl/server";

import { GenericPageLoading } from "@/components/page-state/generic-page-loading";

export default async function Loading() {
  const t = await getTranslations();

  return <GenericPageLoading label={t("Loading.text")} />;
}
