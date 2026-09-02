"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Download } from "lucide-react";

import { Button } from "@/components/ui/button";
import { reportApplicationError, runUserAction } from "@/core/errors/report-application-error";
import { getAdConversionExportAction } from "../../actions";

type ExportState = { generatedAt: string; rowCount: number; googleAdsCsv: string };

function csvHref(content: string): string {
  return `data:text/csv;charset=utf-8,${encodeURIComponent(content)}`;
}

export function AdConversionExportCard() {
  const t = useTranslations();
  const [isPending, setIsPending] = useState(false);
  const [exported, setExported] = useState<ExportState | null>(null);

  const generate = async () => {
    setIsPending(true);
    try {
      setExported(await getAdConversionExportAction());
    } catch (error) {
      reportApplicationError(error);
    } finally {
      setIsPending(false);
    }
  };

  return (
    <section className="flex flex-col gap-3 rounded-card border border-border bg-card p-5 text-card-foreground">
      <div className="space-y-1">
        <h2 className="text-sm font-semibold">{t("OperatorOverview.adConversions.label")}</h2>

        <p className="text-sm text-subdued">{t("OperatorOverview.adConversions.description")}</p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button disabled={isPending} variant="secondary" onClick={() => runUserAction(generate)}>
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

            <span className="text-sm text-subdued">
              {t("OperatorOverview.adConversions.rowCount", { count: exported.rowCount })}
            </span>
          </>
        ) : null}
      </div>
    </section>
  );
}
