import { getTranslations } from "next-intl/server";
import { Button } from "@heroui/button";

import { XCard } from "../components/x-card/x-card";
import { XCardBody } from "../components/x-card/x-card-body";
import { XCardFooter } from "../components/x-card/x-card-footer";
import { XCardHeroHeader } from "../components/x-card/x-card-hero-header";
import { XLink } from "../components/x-link";
import { XPageCenter } from "../components/x-layout-primitives/x-page-center";

export default async function NotFoundPage() {
  const t = await getTranslations("NotFoundPage");

  return (
    <XPageCenter>
      <XCard className="max-w-md">
        <XCardHeroHeader subtitle={t("subtitle")} title={t("title")} />

        <XCardBody>
          <p className="text-x-sm text-center">{t("body")}</p>
        </XCardBody>

        <XCardFooter>
          <Button as={XLink} className="w-full" color="primary" href="/">
            {t("ctaLabel")}
          </Button>
        </XCardFooter>
      </XCard>
    </XPageCenter>
  );
}
