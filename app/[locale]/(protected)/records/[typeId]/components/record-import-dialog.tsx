"use client";

import { reportApplicationError, runUserAction } from "@/core/errors/report-application-error";

import { useEffect, useRef, useState } from "react";
import { observer } from "mobx-react-lite";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import type { RecordExport } from "@/features/data-transfer/record-transfer.schema";
import type { RecordModelView } from "@/features/records/record-model.schema";

import {
  RECORD_IMPORT_LIMIT,
  RECORD_IMPORT_LINK_LIMIT,
  RecordExportSchema,
} from "@/features/data-transfer/record-transfer.schema";
import { isXlsxFileName } from "@/features/data-transfer/import/xlsx/xlsx-workbook";
import { Button } from "@/components/ui/button";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { FormFooterActions } from "@/components/forms/form-footer-actions";
import { AppModal } from "@/components/modal";
import { toastZodErrorTree } from "@/core/utils/toast-zod-error-tree";
import { importRecordsAction } from "../../actions";
import { AppCard } from "@/components/card/app-card";
import { AppCardHeader } from "@/components/card/app-card-header";
import { AppCardBody } from "@/components/card/app-card-body";
import { XlsxImportWizard } from "./xlsx-import-wizard";
import { useXlsxImportText } from "./xlsx-import-text";
import { XlsxImportWizardStore } from "./xlsx-import-wizard.store";
import { xlsxImportPorts } from "./xlsx-import-ports";

const MAX_FILE_BYTES = 10 * 1024 * 1024;

const ACCEPTED_FILES = ".json,.xlsx,application/json,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

export const RecordImportDialog = observer(function RecordImportDialog({
  open,
  onOpenChange,
  typeId,
  schemaRevision,
  model,
  onImported,
}: {
  open: boolean;
  onOpenChange: (value: boolean) => void;
  typeId: string;
  schemaRevision: number;
  model?: RecordModelView;
  onImported: () => Promise<void>;
}) {
  const t = useTranslations();
  const describeIssue = useXlsxImportText().issue;
  const fileInput = useRef<HTMLInputElement>(null);
  const key = useRef<string | null>(null);
  const selectionGeneration = useRef(0);
  const [document, setDocument] = useState<RecordExport | null>(null);
  const [fileName, setFileName] = useState("");
  const [mode, setMode] = useState<"create" | "update">("create");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [format, setFormat] = useState<"json" | "xlsx">("json");
  const [wizard] = useState(() =>
    model
      ? new XlsxImportWizardStore(
          model,
          typeId,
          {
            recordId: t("DataTransfer.xlsxImport.recordId"),
            assignedTo: t("DataTransfer.xlsxImport.assignedTo"),
            rangeStart: t("RecordModel.rangeStart"),
            rangeEnd: t("RecordModel.rangeEnd"),
          },
          xlsxImportPorts(t("DataTransfer.recordImport.failed")),
        )
      : null,
  );
  useEffect(() => {
    if (model) wizard?.setModel(model);
  }, [model, wizard]);

  useEffect(() => {
    selectionGeneration.current += 1;
    setDocument(null);
    setFileName("");
    setError("");
    setMode("create");
    setFormat("json");
    wizard?.reset();
    key.current = null;
    if (fileInput.current) fileInput.current.value = "";
    return () => {
      selectionGeneration.current += 1;
    };
  }, [open, typeId, schemaRevision, wizard]);

  const xlsxActive = format === "xlsx" && wizard !== null;
  const xlsxImported = Boolean(wizard?.summary && wizard.summary.created + wizard.summary.updated > 0);

  const close = (value: boolean) => {
    if (busy || (xlsxActive && wizard.running)) return;
    if (!value) {
      if (xlsxActive && xlsxImported) runUserAction(onImported);
      selectionGeneration.current += 1;
      setDocument(null);
      setFileName("");
      setError("");
      setMode("create");
      setFormat("json");
      wizard?.reset();
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
    if (wizard && isXlsxFileName(file.name)) {
      setFormat("xlsx");
      await wizard.load(file.name, file.arrayBuffer());
      return;
    }
    setFormat("json");
    wizard?.reset();
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
    } catch (error) {
      if (generation !== selectionGeneration.current) return;
      if (!(error instanceof SyntaxError)) reportApplicationError(error);
      setError(t("DataTransfer.import.fileRejected"));
    }
  };
  const submit = async () => {
    if (!document || !key.current || busy) return;
    setBusy(true);
    setError("");
    try {
      const result = await importRecordsAction({ document, mode, idempotencyKey: key.current });
      if (!result.ok) {
        if (!toastZodErrorTree(result.error)) setError(t("DataTransfer.recordImport.failed"));
        setBusy(false);
        return;
      }
      await onImported();
      toast.success(t("DataTransfer.recordImport.success", { count: result.data.created + result.data.updated }));
      setBusy(false);
      close(false);
    } catch (error) {
      reportApplicationError(error);
      setError(t("DataTransfer.recordImport.failed"));
      setBusy(false);
    }
  };
  const advanceWizard = async () => {
    if (!wizard) return;
    if (wizard.step === "result") {
      close(false);
      return;
    }
    await wizard.advance(describeIssue);
  };

  return (
    <AppModal
      description={model ? t("DataTransfer.xlsxImport.fileHint") : t("DataTransfer.recordImport.fileHint")}
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
            accept={model ? ACCEPTED_FILES : ".json,application/json"}
            className="hidden"
            type="file"
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              if (file) runUserAction(() => selectFile(file));
            }}
          />

          {(!xlsxActive || wizard.step === "file") && (
            <>
              <Button
                disabled={busy || (xlsxActive && wizard.loading)}
                type="button"
                variant="secondary"
                onClick={() => fileInput.current?.click()}
              >
                {t("DataTransfer.import.chooseFile")}
              </Button>

              {fileName && <p className="break-all text-sm text-muted-foreground">{fileName}</p>}
            </>
          )}

          {xlsxActive && <XlsxImportWizard store={wizard} />}

          {!xlsxActive && document && (
            <>
              <p className="text-sm">
                {t("DataTransfer.recordImport.ready", {
                  count: document.records.length,
                  links: document.links.length,
                })}
              </p>

              <SegmentedControl
                items={[
                  { value: "create", label: t("DataTransfer.recordImport.create"), disabled: busy, controls: false },
                  { value: "update", label: t("DataTransfer.recordImport.update"), disabled: busy, controls: false },
                ]}
                label={t("DataTransfer.recordImport.mode")}
                value={mode}
                onValueChange={(next) => {
                  setMode(next);
                  key.current = crypto.randomUUID();
                }}
              />
            </>
          )}

          {!xlsxActive && error && (
            <p className="text-sm text-destructive" role="alert">
              {error}
            </p>
          )}
        </AppCardBody>

        {xlsxActive ? (
          <FormFooterActions
            editable
            anchorScope="xlsx-import"
            dirty={wizard.canAdvance}
            saveLabel={
              wizard.step === "result"
                ? t("Common.actions.close")
                : wizard.step === "mode"
                  ? t("DataTransfer.recordImport.submit")
                  : t("DataTransfer.xlsxImport.next")
            }
            saving={wizard.loading || wizard.running}
            onCancel={wizard.summary ? undefined : () => close(false)}
            onRevert={wizard.summary ? () => close(false) : undefined}
            onSave={advanceWizard}
          />
        ) : (
          <FormFooterActions
            editable
            dirty={document !== null}
            saveLabel={t("DataTransfer.recordImport.submit")}
            saving={busy}
            onCancel={() => close(false)}
            onSave={submit}
          />
        )}
      </AppCard>
    </AppModal>
  );
});
