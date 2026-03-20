import { Spinner } from "@heroui/spinner";
import { getTranslations } from "next-intl/server";

import { XPageCenter } from "../../components/x-layout-primitives/x-page-center";

export default async function Loading() {
  const t = await getTranslations("Loading");

  return (
    <XPageCenter>
      <div className="flex flex-col space-y-3 items-center justify-center">
        <Spinner size="lg" />

        <p className="text-x-lg">{t("text")}</p>
      </div>
    </XPageCenter>
  );
}
