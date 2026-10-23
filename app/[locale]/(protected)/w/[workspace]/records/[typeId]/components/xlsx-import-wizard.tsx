"use client";

import type { XlsxImportWizardStore } from "./xlsx-import-wizard.store";

import { observer } from "mobx-react-lite";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { SegmentedControl } from "@/components/ui/segmented-control";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { WizardProgress } from "@/components/shared/wizard-progress";
import { XLSX_SKIP_KEY } from "@/features/data-transfer/import/xlsx/xlsx-mapping";
import { xlsxCellText } from "@/features/data-transfer/import/xlsx/xlsx-workbook";
import { XLSX_WIZARD_STEPS } from "./xlsx-import-wizard.store";
import { useXlsxImportText } from "./xlsx-import-text";

const FAILURE_DISPLAY_LIMIT = 200;

function columnName(index: number): string {
  let remaining = index + 1;
  let name = "";
  while (remaining > 0) {
    const modulo = (remaining - 1) % 26;
    name = String.fromCharCode(65 + modulo) + name;
    remaining = Math.floor((remaining - modulo) / 26);
  }
  return name;
}

export const XlsxImportWizard = observer(function XlsxImportWizard({ store }: { store: XlsxImportWizardStore }) {
  const t = useTranslations();
  const text = useXlsxImportText();
  const describe = text.issue;
  const sheet = store.sheet;
  const stepTitle = text.step(store.step);

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm font-medium">
            {t("DataTransfer.xlsxImport.progress", { current: store.stepNumber, total: XLSX_WIZARD_STEPS.length })}

            {" · "}

            {stepTitle}
          </p>

          {["mapping", "preview", "mode"].includes(store.step) && (
            <Button disabled={store.loading} size="sm" type="button" variant="ghost" onClick={() => store.back()}>
              {t("Common.actions.back")}
            </Button>
          )}
        </div>

        <WizardProgress
          current={store.stepNumber}
          label={t("DataTransfer.xlsxImport.stepsLabel")}
          total={XLSX_WIZARD_STEPS.length}
          valueText={stepTitle}
        />
      </div>

      {store.problem && (
        <p className="text-sm text-destructive" role="alert">
          {text.problem(store.problem)}
        </p>
      )}

      {store.step === "file" && store.workbook && sheet && (
        <div className="space-y-3">
          {store.workbook.sheets.length > 1 && (
            <div className="space-y-1.5">
              <p className="text-sm font-medium" id="xlsx-import-sheet-label">
                {t("DataTransfer.xlsxImport.sheet")}
              </p>

              <Select value={String(store.sheetIndex)} onValueChange={(value) => store.selectSheet(Number(value))}>
                <SelectTrigger aria-labelledby="xlsx-import-sheet-label" className="w-full" id="xlsx-import-sheet">
                  <SelectValue />
                </SelectTrigger>

                <SelectContent>
                  {store.workbook.sheets.map((candidate, index) => (
                    <SelectItem key={candidate.name} value={String(index)}>
                      {candidate.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <p className="text-sm text-muted-foreground">
            {t("DataTransfer.xlsxImport.sheetSummary", {
              sheet: sheet.name,
              rows: sheet.rows.length,
              columns: sheet.headers.length,
            })}
          </p>
        </div>
      )}

      {store.step === "mapping" && sheet && <XlsxMappingStep store={store} />}

      {store.step === "preview" && sheet && (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            {t("DataTransfer.xlsxImport.previewHint", {
              count: store.previewRows.filter((row) => row.issues.length > 0).length,
              rows: store.previewRows.length,
            })}
          </p>

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("DataTransfer.xlsxImport.row")}</TableHead>

                {store.mapping.map((key, column) =>
                  key === XLSX_SKIP_KEY ? null : (
                    <TableHead key={column}>
                      {store.options.find((option) => option.key === key)?.label ?? sheet.headers[column]}
                    </TableHead>
                  ),
                )}
              </TableRow>
            </TableHeader>

            <TableBody>
              {store.previewRows.map(({ row, issues }) => (
                <TableRow key={row.sheetRow} data-invalid={issues.length > 0 ? "true" : undefined}>
                  <TableCell className="text-muted-foreground">{row.sheetRow}</TableCell>

                  {store.mapping.map((key, column) => {
                    if (key === XLSX_SKIP_KEY) return null;
                    const issue = issues.find((candidate) => candidate.columnIndex === column);
                    return (
                      <TableCell key={column} className="max-w-60 align-top">
                        <span className="line-clamp-2 break-words">{xlsxCellText(row.cells[column] ?? null)}</span>

                        {issue && <span className="block text-xs text-destructive">{describe(issue)}</span>}
                      </TableCell>
                    );
                  })}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {store.step === "mode" && (
        <div className="space-y-4">
          <SegmentedControl
            items={[
              { value: "create", label: t("DataTransfer.xlsxImport.create"), controls: false },
              { value: "update", label: t("DataTransfer.xlsxImport.update"), controls: false },
            ]}
            label={t("DataTransfer.recordImport.mode")}
            value={store.mode}
            onValueChange={(mode) => store.setMode(mode)}
          />

          {store.mode === "update" &&
            (store.matchChoices.length ? (
              <div className="space-y-1.5">
                <p className="text-sm font-medium" id="xlsx-import-match-label">
                  {t("DataTransfer.xlsxImport.matchBy")}
                </p>

                <Select value={store.matchKey ?? undefined} onValueChange={(key) => store.setMatchKey(key)}>
                  <SelectTrigger aria-labelledby="xlsx-import-match-label" className="w-full" id="xlsx-import-match">
                    <SelectValue />
                  </SelectTrigger>

                  <SelectContent>
                    {store.matchChoices.map((choice) => (
                      <SelectItem key={choice.key} value={choice.key}>
                        {choice.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <p className="text-sm text-muted-foreground">{t("DataTransfer.xlsxImport.matchHint")}</p>
              </div>
            ) : (
              <p className="text-sm text-destructive" role="alert">
                {t("DataTransfer.xlsxImport.noMatchColumn")}
              </p>
            ))}

          {store.mode === "create" && (
            <p className="text-sm text-muted-foreground">{t("DataTransfer.xlsxImport.createHint")}</p>
          )}
        </div>
      )}

      {store.step === "result" && <XlsxResultStep store={store} />}
    </div>
  );
});

const XlsxMappingStep = observer(function XlsxMappingStep({ store }: { store: XlsxImportWizardStore }) {
  const t = useTranslations();
  const sheet = store.sheet;
  if (!sheet) return null;
  const fields = store.options.filter((option) => option.target.kind === "field" || option.target.kind === "nameParts");
  const relationships = store.options.filter((option) => option.target.kind === "relationship");
  const other = store.options.filter(
    (option) => option.target.kind === "assignedTo" || option.target.kind === "recordId",
  );

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">{t("DataTransfer.xlsxImport.mappingHint")}</p>

      <ul className="space-y-3">
        {sheet.headers.map((header, column) => {
          const key = store.mapping[column] ?? XLSX_SKIP_KEY;
          const samples = sheet.rows
            .map((row) => xlsxCellText(row.cells[column] ?? null))
            .filter(Boolean)
            .slice(0, 2);
          const labelId = `xlsx-import-column-${column}`;
          const duplicate = key !== XLSX_SKIP_KEY && store.duplicates.includes(key);
          return (
            <li key={column} className="grid gap-1.5 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] sm:items-center">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium" id={labelId}>
                  {header || t("DataTransfer.xlsxImport.column", { name: columnName(column) })}
                </p>

                {samples.length > 0 && <p className="truncate text-xs text-muted-foreground">{samples.join(", ")}</p>}
              </div>

              <div className="min-w-0 space-y-1">
                <Select value={key} onValueChange={(next) => store.setTarget(column, next)}>
                  <SelectTrigger
                    aria-invalid={duplicate || undefined}
                    aria-labelledby={labelId}
                    className="w-full"
                    id={`xlsx-import-target-${column}`}
                  >
                    <SelectValue />
                  </SelectTrigger>

                  <SelectContent>
                    <SelectItem value={XLSX_SKIP_KEY}>{t("DataTransfer.xlsxImport.skip")}</SelectItem>

                    {fields.length > 0 && (
                      <SelectGroup>
                        <SelectLabel>{t("DataTransfer.xlsxImport.fields")}</SelectLabel>

                        {fields.map((option) => (
                          <SelectItem key={option.key} value={option.key}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    )}

                    {relationships.length > 0 && (
                      <SelectGroup>
                        <SelectLabel>{t("DataTransfer.xlsxImport.relationships")}</SelectLabel>

                        {relationships.map((option) => (
                          <SelectItem key={option.key} value={option.key}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    )}

                    <SelectGroup>
                      <SelectLabel>{t("DataTransfer.xlsxImport.other")}</SelectLabel>

                      {other.map((option) => (
                        <SelectItem key={option.key} value={option.key}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>

                {duplicate && <p className="text-xs text-destructive">{t("DataTransfer.xlsxImport.duplicate")}</p>}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
});

const XlsxResultStep = observer(function XlsxResultStep({ store }: { store: XlsxImportWizardStore }) {
  const t = useTranslations();
  const summary = store.summary;

  if (store.failure) {
    return (
      <p className="text-sm text-destructive" role="alert">
        {t("DataTransfer.xlsxImport.lookupFailed")}
      </p>
    );
  }

  if (!summary) {
    return (
      <div aria-live="polite" className="space-y-2">
        <p className="text-sm">
          {t("DataTransfer.xlsxImport.importing", { processed: store.processed, total: store.total })}
        </p>

        <WizardProgress
          current={store.total ? store.processed : 0}
          label={t("DataTransfer.xlsxImport.importProgress")}
          total={Math.max(store.total, 1)}
          valueText={t("DataTransfer.xlsxImport.importing", { processed: store.processed, total: store.total })}
        />
      </div>
    );
  }

  return (
    <div aria-live="polite" className="space-y-3">
      <ul className="space-y-1 text-sm" data-testid="xlsx-import-summary">
        <li>{t("DataTransfer.xlsxImport.created", { count: summary.created })}</li>

        <li>{t("DataTransfer.xlsxImport.updated", { count: summary.updated })}</li>

        <li>{t("DataTransfer.xlsxImport.skipped", { count: summary.skipped })}</li>

        <li className={summary.failed.length ? "text-destructive" : undefined}>
          {t("DataTransfer.xlsxImport.failed", { count: summary.failed.length })}
        </li>
      </ul>

      {summary.failed.length > 0 && (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("DataTransfer.xlsxImport.row")}</TableHead>

              <TableHead>{t("DataTransfer.xlsxImport.reason")}</TableHead>
            </TableRow>
          </TableHeader>

          <TableBody>
            {summary.failed.slice(0, FAILURE_DISPLAY_LIMIT).map((failure) => (
              <TableRow key={failure.sheetRow}>
                <TableCell className="align-top text-muted-foreground">{failure.sheetRow}</TableCell>

                <TableCell className="whitespace-normal">{failure.reasons.join(" ")}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      {summary.failed.length > FAILURE_DISPLAY_LIMIT && (
        <p className="text-xs text-muted-foreground">
          {t("DataTransfer.xlsxImport.moreFailures", { count: summary.failed.length - FAILURE_DISPLAY_LIMIT })}
        </p>
      )}
    </div>
  );
});
