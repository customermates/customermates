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
import { toastZodErrorTree } from "@/core/utils/toast-zod-error-tree";
import { getAdConversionExportAction, uploadAdConversionsAction } from "../../actions";
import { operatorCsvHref } from "../operator-csv-href";

type ExportState = { googleAdsCsv: string; rowCount: number; withoutColumnCount: number };

type UploadMessage = { text: string; warning: boolean };

function uploadedRows(upload: AdConversionUploadDto, outcome: AdConversionUploadDto["batches"][number]["result"]) {
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
      const result = await uploadAdConversionsAction();
      if (!result.ok) {
        toastZodErrorTree(result.error);
        return;
      }
      setUpload(result.data);
    } finally {
      setIsUploading(false);
    }
  };

  const uploadMessages = (result: AdConversionUploadDto): UploadMessage[] => {
    const info = (text: string) => ({ text, warning: false });
    const warning = (text: string) => ({ text, warning: true });
    if (result.status === "disabled") return [info(t("OperatorOverview.adConversions.uploadDisabled"))];
    if (result.status === "incomplete")
      return [warning(t("OperatorOverview.adConversions.uploadIncomplete", { names: result.missing.join(", ") }))];
    if (result.status === "nothingToSend")
      return [info(t("OperatorOverview.adConversions.uploadNothing", { count: result.alreadyReportedCount }))];
    if (result.status === "authorizationFailed")
      return [warning(t("OperatorOverview.adConversions.uploadAuthorizationFailed"))];
    if (result.status === "unavailable") return [warning(t("OperatorOverview.adConversions.uploadUnavailable"))];

    const submitted = uploadedRows(result, "submitted");
    const rejected = uploadedRows(result, "rejected");
    const ambiguous = uploadedRows(result, "ambiguous");
    return [
      submitted > 0 && result.mode === "validate"
        ? info(t("OperatorOverview.adConversions.uploadValidated", { count: submitted }))
        : null,
      submitted > 0 && result.mode === "ingest"
        ? info(t("OperatorOverview.adConversions.uploadSubmitted", { count: submitted }))
        : null,
      rejected > 0 ? warning(t("OperatorOverview.adConversions.uploadRejected", { count: rejected })) : null,
      ambiguous > 0 ? warning(t("OperatorOverview.adConversions.uploadAmbiguous", { count: ambiguous })) : null,
    ].filter((message): message is UploadMessage => message !== null);
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
                <span
                  key={message.text}
                  className={message.warning ? "text-xs text-warning" : "text-xs text-muted-foreground"}
                >
                  {message.text}
                </span>
              ))
            : null}
        </div>
      </AppCardBody>
    </AppCard>
  );
}
