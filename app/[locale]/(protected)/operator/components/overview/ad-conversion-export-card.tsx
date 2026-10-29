"use client";

import type { AdConversionUploadDto } from "@/ee/operator/ad-conversion-upload.schema";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Download, Megaphone } from "lucide-react";

import { AppCard } from "@/components/card/app-card";
import { AppCardBody } from "@/components/card/app-card-body";
import { AppCardHeader } from "@/components/card/app-card-header";
import { Button } from "@/components/ui/button";
import { IconContainer } from "@/components/shared/icon-container";
import { runUserAction } from "@/core/errors/report-application-error";
import { getAdConversionExportAction, uploadAdConversionsAction } from "../../actions";
import { operatorCsvHref } from "../operator-csv-href";

type ExportState = { googleAdsCsv: string; rowCount: number; withoutColumnCount: number };

function uploadedRows(upload: AdConversionUploadDto, outcome: "accepted" | "rejected" | "ambiguous") {
  return upload.batches.filter((batch) => batch.result === outcome).reduce((sum, batch) => sum + batch.rowCount, 0);
}

export function AdConversionExportCard() {
  const t = useTranslations();
  const [isLoading, setIsLoading] = useState(false);
  const [exported, setExported] = useState<ExportState | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [upload, setUpload] = useState<AdConversionUploadDto | null>(null);

  const send = async () => {
    setIsUploading(true);
    try {
      setUpload(await uploadAdConversionsAction());
    } finally {
      setIsUploading(false);
    }
  };

  const uploadMessages = (result: AdConversionUploadDto) => {
    if (result.status === "disabled") return [t("OperatorOverview.adConversions.uploadDisabled")];
    if (result.status === "incomplete")
      return [t("OperatorOverview.adConversions.uploadIncomplete", { names: result.missing.join(", ") })];
    if (result.status === "nothingToSend")
      return [t("OperatorOverview.adConversions.uploadNothing", { count: result.alreadyReportedCount })];
    if (result.status === "authorizationFailed") return [t("OperatorOverview.adConversions.uploadAuthorizationFailed")];

    const accepted = uploadedRows(result, "accepted");
    const rejected = uploadedRows(result, "rejected");
    const ambiguous = uploadedRows(result, "ambiguous");
    return [
      accepted > 0 && result.mode === "validate"
        ? t("OperatorOverview.adConversions.uploadValidated", { count: accepted })
        : null,
      accepted > 0 && result.mode === "ingest"
        ? t("OperatorOverview.adConversions.uploadAccepted", { count: accepted })
        : null,
      rejected > 0 ? t("OperatorOverview.adConversions.uploadRejected", { count: rejected }) : null,
      ambiguous > 0 ? t("OperatorOverview.adConversions.uploadAmbiguous", { count: ambiguous }) : null,
    ].filter((message): message is string => message !== null);
  };

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
                <a download="google-ads-conversions.csv" href={operatorCsvHref(exported.googleAdsCsv)}>
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

        <div aria-busy={isUploading} aria-live="polite" className="flex flex-col items-start gap-2">
          <Button disabled={isUploading} variant="secondary" onClick={() => runUserAction(send)}>
            {t("OperatorOverview.adConversions.upload")}
          </Button>

          {upload
            ? uploadMessages(upload).map((message) => (
                <span key={message} className="text-xs text-muted-foreground">
                  {message}
                </span>
              ))
            : null}
        </div>
      </AppCardBody>
    </AppCard>
  );
}
