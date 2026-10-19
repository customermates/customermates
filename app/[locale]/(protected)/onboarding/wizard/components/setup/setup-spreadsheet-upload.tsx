"use client";

import type { SpreadsheetReadFailureCode } from "@/features/data-transfer/spreadsheet/spreadsheet.schema";

import { Loader2 } from "lucide-react";
import { observer } from "mobx-react-lite";
import { useRef } from "react";
import { useTranslations } from "next-intl";

import { FormLabel } from "@/components/forms/form-label";
import { Button } from "@/components/ui/button";
import { runUserAction } from "@/core/errors/report-application-error";
import { useRootStore } from "@/core/stores/root-store.provider";
import {
  SPREADSHEET_MAX_CELL_LENGTH,
  SPREADSHEET_MAX_COLUMNS,
  SPREADSHEET_MAX_FILE_BYTES,
  SPREADSHEET_MAX_ROWS,
} from "@/features/data-transfer/spreadsheet/spreadsheet.schema";

const SPREADSHEET_ACCEPT = ".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

const MAX_MEGABYTES = SPREADSHEET_MAX_FILE_BYTES / (1024 * 1024);

function useSpreadsheetFailureMessage() {
  const t = useTranslations();
  const messages: Record<SpreadsheetReadFailureCode, string> = {
    fileTooLarge: t("WorkspaceSetup.interview.uploadFailures.fileTooLarge", { maxMegabytes: MAX_MEGABYTES }),
    unsupportedFormat: t("WorkspaceSetup.interview.uploadFailures.unsupportedFormat"),
    macroWorkbook: t("WorkspaceSetup.interview.uploadFailures.macroWorkbook"),
    unreadableFile: t("WorkspaceSetup.interview.uploadFailures.unreadableFile"),
    sheetNotFound: t("WorkspaceSetup.interview.uploadFailures.sheetNotFound"),
    noHeader: t("WorkspaceSetup.interview.uploadFailures.noHeader"),
    tooManyRows: t("WorkspaceSetup.interview.uploadFailures.tooManyRows", { maxRows: SPREADSHEET_MAX_ROWS }),
    tooManyColumns: t("WorkspaceSetup.interview.uploadFailures.tooManyColumns", {
      maxColumns: SPREADSHEET_MAX_COLUMNS,
    }),
    cellTooLong: t("WorkspaceSetup.interview.uploadFailures.cellTooLong", {
      maxCharacters: SPREADSHEET_MAX_CELL_LENGTH,
    }),
  };
  return (failure: SpreadsheetReadFailureCode) => messages[failure];
}

export const SetupSpreadsheetUpload = observer(function SetupSpreadsheetUpload() {
  const t = useTranslations();
  const { workspaceSetupStore: store } = useRootStore();
  const failureMessage = useSpreadsheetFailureMessage();
  const input = useRef<HTMLInputElement>(null);
  const uploaded = store.setup?.spreadsheet ?? null;
  const rejection = store.spreadsheetRejection;
  const uploading = store.pending === "upload";

  return (
    <div className="space-y-1.5">
      <FormLabel htmlFor="setup-spreadsheet">{t("WorkspaceSetup.actions.upload")}</FormLabel>

      <input
        ref={input}
        accept={SPREADSHEET_ACCEPT}
        aria-label={t("WorkspaceSetup.actions.upload")}
        className="sr-only"
        id="setup-spreadsheet"
        tabIndex={-1}
        type="file"
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (file) runUserAction(() => store.uploadSpreadsheet(file));
        }}
      />

      <div className="flex flex-wrap items-center gap-3">
        <Button disabled={store.isBusy} type="button" variant="secondary" onClick={() => input.current?.click()}>
          {uploading ? <Loader2 className="animate-spin motion-reduce:animate-none" /> : null}

          {uploaded ? t("WorkspaceSetup.interview.uploadReplace") : t("WorkspaceSetup.interview.uploadChoose")}
        </Button>

        {uploaded ? <p className="min-w-0 text-sm break-all text-muted-foreground">{uploaded.fileName}</p> : null}
      </div>

      {rejection ? (
        <p className="text-xs break-words text-destructive" role="alert">
          {t("WorkspaceSetup.interview.uploadRejected", {
            fileName: rejection.fileName,
            reason: failureMessage(rejection.failure),
          })}

          {uploaded ? ` ${t("WorkspaceSetup.interview.uploadKept", { fileName: uploaded.fileName })}` : null}
        </p>
      ) : null}

      <p className="text-xs text-muted-foreground">
        {uploaded
          ? t("WorkspaceSetup.interview.uploadReady")
          : t("WorkspaceSetup.interview.uploadHint", { maxMegabytes: MAX_MEGABYTES, maxRows: SPREADSHEET_MAX_ROWS })}
      </p>
    </div>
  );
});
