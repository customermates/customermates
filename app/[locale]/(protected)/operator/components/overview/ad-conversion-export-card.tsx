"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Download, Megaphone } from "lucide-react";

import { AppCard } from "@/components/card/app-card";
import { AppCardBody } from "@/components/card/app-card-body";
import { AppCardHeader } from "@/components/card/app-card-header";
import { Button } from "@/components/ui/button";
import { IconContainer } from "@/components/shared/icon-container";
import { runUserAction } from "@/core/errors/report-application-error";
import { getAdConversionExportAction } from "../../actions";

type ExportState = { googleAdsCsv: string; rowCount: number; withoutColumnCount: number };

function csvHref(content: string): string {
  return `data:text/csv;charset=utf-8,${encodeURIComponent(content)}`;
}

export function AdConversionExportCard() {
  const t = useTranslations();
  const [isLoading, setIsLoading] = useState(false);
  const [exported, setExported] = useState<ExportState | null>(null);

  const generate = async () => {
    setIsLoading(true);
    try {
      const result = await getAdConversionExportAction();
      setExported({
        googleAdsCsv: result.googleAdsCsv,
        rowCount: result.googleAdsRowCount,
        withoutColumnCount: result.googleAdsWithoutColumnCount,
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <AppCard>
      <AppCardHeader className="gap-3">
        <IconContainer className="shrink-0" icon={Megaphone} size="sm" />

        <h2 className="text-x-sm grow truncate text-muted-foreground">{t("OperatorOverview.adConversions.label")}</h2>
      </AppCardHeader>

      <AppCardBody className="gap-3">
        <p className="text-xs text-muted-foreground">{t("OperatorOverview.adConversions.description")}</p>

        <div aria-busy={isLoading} aria-live="polite" className="flex flex-wrap items-center gap-2">
          <Button disabled={isLoading} variant="secondary" onClick={() => runUserAction(generate)}>
            {t("OperatorOverview.adConversions.generate")}
          </Button>

          {exported ? (
            <>
              <Button asChild variant="secondary">
                <a download="google-ads-conversions.csv" href={csvHref(exported.googleAdsCsv)}>
                  <Download aria-hidden="true" className="size-4" />

                  {t("OperatorOverview.adConversions.googleAds")}
                </a>
              </Button>

              <span className="text-xs text-muted-foreground">
                {t("OperatorOverview.adConversions.rowCount", { count: exported.rowCount })}
              </span>

              {exported.withoutColumnCount > 0 ? (
                <span className="text-xs text-warning">
                  {t("OperatorOverview.adConversions.withoutColumnCount", { count: exported.withoutColumnCount })}
                </span>
              ) : null}
            </>
          ) : null}
        </div>
      </AppCardBody>
    </AppCard>
  );
}
