"use client";

import { FileSpreadsheet, Loader2, Upload } from "lucide-react";
import { observer } from "mobx-react-lite";
import { useRef } from "react";
import { useTranslations } from "next-intl";

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
    <div className="flex flex-col gap-3 rounded-lg border border-dashed border-border-strong p-4 sm:flex-row sm:items-center">
      <FileSpreadsheet aria-hidden className="size-8 shrink-0 text-muted-foreground" strokeWidth={1.5} />

      <div className="min-w-0 flex-1 space-y-0.5">
        <p className="truncate text-sm font-medium">
          {uploaded ? uploaded.fileName : t("WorkspaceSetup.actions.upload")}
        </p>

        <p className="text-xs text-muted-foreground">
          {uploaded
            ? t("WorkspaceSetup.interview.uploadReady")
            : t("WorkspaceSetup.interview.uploadHint", { maxMegabytes: 5, maxRows: 2_000 })}
        </p>
      </div>

      <input
        ref={input}
        accept={SPREADSHEET_ACCEPT}
        aria-label={t("WorkspaceSetup.actions.upload")}
        className="sr-only"
        tabIndex={-1}
        type="file"
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (file) runUserAction(() => store.uploadSpreadsheet(file));
        }}
      />

      <Button
        disabled={store.isBusy}
        size="sm"
        type="button"
        variant="secondary"
        onClick={() => input.current?.click()}
      >
        {uploading ? <Loader2 className="animate-spin motion-reduce:animate-none" /> : <Upload />}

        {uploaded ? t("WorkspaceSetup.interview.uploadReplace") : t("WorkspaceSetup.interview.uploadChoose")}
      </Button>
    </div>
  );
});
