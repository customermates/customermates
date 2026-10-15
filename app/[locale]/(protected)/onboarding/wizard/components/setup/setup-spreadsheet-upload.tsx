"use client";

import { Loader2 } from "lucide-react";
import { observer } from "mobx-react-lite";
import { useRef } from "react";
import { useTranslations } from "next-intl";

import { FormLabel } from "@/components/forms/form-label";
import { Button } from "@/components/ui/button";
import { runUserAction } from "@/core/errors/report-application-error";
import { useRootStore } from "@/core/stores/root-store.provider";

const SPREADSHEET_ACCEPT = ".csv,.xlsx,.xls,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

export const SetupSpreadsheetUpload = observer(function SetupSpreadsheetUpload() {
  const t = useTranslations();
  const { workspaceSetupStore: store } = useRootStore();
  const input = useRef<HTMLInputElement>(null);
  const uploaded = store.setup?.spreadsheet ?? null;
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

      <p className="text-xs text-muted-foreground">
        {uploaded
          ? t("WorkspaceSetup.interview.uploadReady")
          : t("WorkspaceSetup.interview.uploadHint", { maxMegabytes: 5, maxRows: 2_000 })}
      </p>
    </div>
  );
});
