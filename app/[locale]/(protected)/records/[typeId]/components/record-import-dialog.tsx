"use client";

import { runUserAction } from "@/core/errors/report-application-error";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import type { RecordExport } from "@/features/data-transfer/record-transfer.schema";

import {
  RECORD_IMPORT_LIMIT,
  RECORD_IMPORT_LINK_LIMIT,
  RecordExportSchema,
} from "@/features/data-transfer/record-transfer.schema";
import { Button } from "@/components/ui/button";
import { AppModal } from "@/components/modal";
import { AppCard } from "@/components/card/app-card";
import { AppCardHeader } from "@/components/card/app-card-header";
import { AppCardBody } from "@/components/card/app-card-body";

const MAX_FILE_BYTES = 10 * 1024 * 1024;

export function RecordImportDialog({
  open,
  onOpenChange,
  typeId,
  schemaRevision,
  onImported,
}: {
  open: boolean;
  onOpenChange: (value: boolean) => void;
  typeId: string;
  schemaRevision: number;
  onImported: () => Promise<void>;
}) {
  const t = useTranslations();
  const fileInput = useRef<HTMLInputElement>(null);
  const key = useRef<string | null>(null);
  const selectionGeneration = useRef(0);
  const [document, setDocument] = useState<RecordExport | null>(null);
  const [fileName, setFileName] = useState("");
  const [mode, setMode] = useState<"create" | "update">("create");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    selectionGeneration.current += 1;
    setDocument(null);
    setFileName("");
    setError("");
    setMode("create");
    key.current = null;
    if (fileInput.current) fileInput.current.value = "";
    return () => {
      selectionGeneration.current += 1;
    };
  }, [open, typeId, schemaRevision]);

  const close = (value: boolean) => {
    if (busy) return;
    if (!value) {
      selectionGeneration.current += 1;
      setDocument(null);
      setFileName("");
      setError("");
      setMode("create");
      key.current = null;
    }
    onOpenChange(value);
  };
  const selectFile = async (file: File) => {
    const generation = ++selectionGeneration.current;
    setDocument(null);
    setFileName(file.name);
    setError("");
    key.current = crypto.randomUUID();
    if (file.size > MAX_FILE_BYTES) {
      setError(t("DataTransfer.import.fileRejected"));
      return;
    }
    try {
      const contents = await file.text();
      if (generation !== selectionGeneration.current) return;
      const parsed = RecordExportSchema.safeParse(JSON.parse(contents));
      if (!parsed.success) {
        setError(t("DataTransfer.import.fileRejected"));
        return;
      }
      if (parsed.data.typeId !== typeId) {
        setError(t("DataTransfer.recordImport.typeMismatch"));
        return;
      }
      if (parsed.data.schemaRevision !== schemaRevision) {
        setError(t("DataTransfer.recordImport.schemaMismatch"));
        return;
      }
      if (parsed.data.records.length > RECORD_IMPORT_LIMIT || parsed.data.links.length > RECORD_IMPORT_LINK_LIMIT) {
        setError(t("DataTransfer.recordImport.tooLarge"));
        return;
      }
      setDocument(parsed.data);
    } catch {
      if (generation === selectionGeneration.current) setError(t("DataTransfer.import.fileRejected"));
    }
  };
  const submit = async () => {
    if (!document || !key.current || busy) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/v1/records/import", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ document, mode, idempotencyKey: key.current }),
      });
      if (!response.ok) throw new Error(`Import failed (${response.status})`);
      const result = await response.json();
      await onImported();
      toast.success(t("DataTransfer.recordImport.success", { count: result.created + result.updated }));
      setBusy(false);
      close(false);
    } catch {
      setError(t("DataTransfer.recordImport.failed"));
      setBusy(false);
    }
  };

  return (
    <AppModal
      description={t("DataTransfer.recordImport.fileHint")}
      open={open}
      title={t("DataTransfer.recordImport.title")}
      onClose={() => close(false)}
    >
      <AppCard>
        <AppCardHeader>
          <h2 className="text-lg font-semibold">{t("DataTransfer.recordImport.title")}</h2>
        </AppCardHeader>

        <AppCardBody className="space-y-4">
          <input
            ref={fileInput}
            accept=".json,application/json"
            className="hidden"
            type="file"
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              if (file) runUserAction(() => selectFile(file));
            }}
          />

          <Button disabled={busy} type="button" variant="secondary" onClick={() => fileInput.current?.click()}>
            {t("DataTransfer.import.chooseFile")}
          </Button>

          {fileName && <p className="break-all text-sm text-muted-foreground">{fileName}</p>}

          {document && (
            <>
              <p className="text-sm">
                {t("DataTransfer.recordImport.ready", {
                  count: document.records.length,
                  links: document.links.length,
                })}
              </p>

              <div aria-label={t("DataTransfer.recordImport.title")} className="flex flex-wrap gap-2" role="group">
                <Button
                  aria-pressed={mode === "create"}
                  disabled={busy}
                  type="button"
                  variant={mode === "create" ? "default" : "secondary"}
                  onClick={() => {
                    setMode("create");
                    key.current = crypto.randomUUID();
                  }}
                >
                  {t("DataTransfer.recordImport.create")}
                </Button>

                <Button
                  aria-pressed={mode === "update"}
                  disabled={busy}
                  type="button"
                  variant={mode === "update" ? "default" : "secondary"}
                  onClick={() => {
                    setMode("update");
                    key.current = crypto.randomUUID();
                  }}
                >
                  {t("DataTransfer.recordImport.update")}
                </Button>
              </div>
            </>
          )}

          {error && (
            <p className="text-sm text-destructive" role="alert">
              {error}
            </p>
          )}

          <div className="flex justify-end">
            <Button disabled={!document || busy} type="button" onClick={() => runUserAction(() => submit())}>
              {t("DataTransfer.recordImport.submit")}
            </Button>
          </div>
        </AppCardBody>
      </AppCard>
    </AppModal>
  );
}
