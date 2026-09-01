"use client";

import type { ImportRowIssue } from "@/features/data-transfer/import/import-issues";
import type { MappingTarget } from "@/features/data-transfer/import/import-mapping";

import { MessagingProvider } from "@/generated/prisma";
import { observer } from "mobx-react-lite";
import { useRef } from "react";
import { useTranslations } from "next-intl";

import { AppCard } from "@/components/card/app-card";
import { AppCardBody } from "@/components/card/app-card-body";
import { AppCardFooter } from "@/components/card/app-card-footer";
import { AppCardHeader } from "@/components/card/app-card-header";
import { AppModal } from "@/components/modal";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { WizardProgress } from "@/components/shared/wizard-progress";
import { runUserAction } from "@/core/errors/report-application-error";
import { targetIdentity } from "@/features/data-transfer/import/import-mapping";
import { useRootStore } from "@/core/stores/root-store.provider";

const STEP_ORDER = ["file", "mapping", "preview", "result"] as const;

const IGNORE_VALUE = "ignore";

const RECORD_ID_VALUE = "recordId";

function columnPrefix(issue: ImportRowIssue): string {
  const letter = issue.columnLetter ? `${issue.columnLetter}. ` : "";

  return `${letter}${issue.columnLabel}:`;
}

function ImportIssueList({ issues }: { issues: ImportRowIssue[] }) {
  const t = useTranslations();

  return (
    <div className="space-y-2">
      <p className="text-sm text-destructive">{t("DataTransfer.import.issueCount", { count: issues.length })}</p>

      <ul className="max-h-80 space-y-1 overflow-y-auto text-sm">
        {issues.slice(0, ISSUE_DISPLAY_LIMIT).map((issue, index) => (
          <li key={index} className="flex gap-2">
            <span className="shrink-0 font-mono text-xs text-muted-foreground">
              {issue.sheetRow ? `${t("DataTransfer.import.row")} ${issue.sheetRow}` : "-"}
            </span>

            <span className="min-w-0">
              {issue.columnLabel && <span className="mr-1 font-medium">{columnPrefix(issue)}</span>}

              {issue.values ? t(`DataTransfer.import.issues.${issue.code}`, issue.values) : issue.message}
            </span>
          </li>
        ))}
      </ul>

      {issues.length > ISSUE_DISPLAY_LIMIT && (
        <p className="text-xs text-muted-foreground">
          {t("DataTransfer.import.moreIssues", { count: issues.length - ISSUE_DISPLAY_LIMIT })}
        </p>
      )}
    </div>
  );
}

const ISSUE_DISPLAY_LIMIT = 200;

function decodeTarget(value: string): MappingTarget {
  if (value === IGNORE_VALUE) return { kind: "ignore" };
  if (value === RECORD_ID_VALUE) return { kind: "recordId" };
  if (value.startsWith("custom:")) return { kind: "customField", columnId: value.slice("custom:".length) };
  if (value.startsWith("identifier:")) return { kind: "identifier", provider: value.slice("identifier:".length) };

  return { kind: "field", key: value.slice("field:".length) };
}

export const ImportWizard = observer(function ImportWizard() {
  const { importWizardStore: store } = useRootStore();
  const t = useTranslations();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const stepNumber = STEP_ORDER.indexOf(store.step) + 1;
  const progressText = t("DataTransfer.import.progress", { current: stepNumber, total: STEP_ORDER.length });

  const fieldOptions = store.descriptor.fields.map((field) => ({
    value: `field:${field.key}`,
    label: t(field.labelKey),
  }));

  const customOptions = store.customColumns.map((column) => ({
    value: `custom:${column.id}`,
    label: column.label,
  }));

  const channelOptions = store.descriptor.supportsIdentifiers
    ? Object.values(MessagingProvider).map((provider) => ({
        value: `identifier:${provider}`,
        label: t("DataTransfer.import.channelOption", { provider: t(`Common.providers.${provider}`) }),
      }))
    : [];

  return (
    <AppModal
      description={t("DataTransfer.import.description")}
      size="5xl"
      store={store}
      title={t("DataTransfer.import.title")}
    >
      <AppCard>
        <AppCardHeader className="flex-col items-start gap-4">
          <div className="min-w-0 flex-1 space-y-1">
            <p className="text-xs text-muted-foreground">{progressText}</p>

            <h2 className="min-w-0 break-words text-xl font-semibold">{t("DataTransfer.import.title")}</h2>
          </div>

          <WizardProgress
            current={stepNumber}
            label={t("DataTransfer.import.progressLabel")}
            total={STEP_ORDER.length}
            valueText={progressText}
          />
        </AppCardHeader>

        <AppCardBody>
          {store.step === "file" && (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">{t("DataTransfer.import.fileHint")}</p>

              <input
                ref={fileInputRef}
                accept=".xlsx"
                className="hidden"
                type="file"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  event.target.value = "";
                  if (file) runUserAction(() => store.selectFile(file));
                }}
              />

              <Button
                disabled={store.isBusy}
                id="import-choose-file"
                type="button"
                variant="secondary"
                onClick={() => fileInputRef.current?.click()}
              >
                {t("DataTransfer.import.chooseFile")}
              </Button>

              {store.fileError && <p className="text-sm text-destructive">{t("DataTransfer.import.fileRejected")}</p>}
            </div>
          )}

          {store.step === "mapping" && store.parsed && (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                {t("DataTransfer.import.mappingHint", { file: store.fileName, rows: store.parsed.rows.length })}
              </p>

              {store.duplicateTargetCount > 0 && (
                <p className="text-sm text-destructive">
                  {t("DataTransfer.import.duplicateTargets", { count: store.duplicateTargetCount })}
                </p>
              )}

              <ul className="space-y-2">
                {store.parsed.sources.map((source, index) => (
                  <li key={source.index} className="flex items-center gap-3">
                    <span className="flex w-1/3 min-w-0 flex-col">
                      <span className="truncate text-sm font-medium">
                        {`${source.letter}. ${source.header || t("DataTransfer.import.unnamedColumn")}`}
                      </span>

                      {source.samples.length > 0 && (
                        <span className="truncate text-xs text-muted-foreground">{source.samples.join(", ")}</span>
                      )}
                    </span>

                    <Select
                      value={targetIdentity(store.mapping[index] ?? { kind: "ignore" })}
                      onValueChange={(value) => store.setTarget(index, decodeTarget(value))}
                    >
                      <SelectTrigger className="w-2/3">
                        <SelectValue placeholder=" " />
                      </SelectTrigger>

                      <SelectContent>
                        <SelectItem value={IGNORE_VALUE}>{t("DataTransfer.import.ignoreColumn")}</SelectItem>

                        <SelectItem value={RECORD_ID_VALUE}>{t("DataTransfer.import.recordId")}</SelectItem>

                        {fieldOptions.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label}
                          </SelectItem>
                        ))}

                        {customOptions.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label}
                          </SelectItem>
                        ))}

                        {channelOptions.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {store.step === "preview" && store.plan && (
            <div className="space-y-3">
              <p className="text-sm">
                {t("DataTransfer.import.previewCounts", {
                  create: store.plan.create.length,
                  update: store.plan.update.length,
                })}
              </p>

              {store.issues.length === 0 ? (
                <p className="text-sm text-success">{t("DataTransfer.import.noIssues")}</p>
              ) : (
                <div className="space-y-2">
                  <ImportIssueList issues={store.issues} />

                  {store.skippableCount > 0 && (
                    <label className="flex items-center gap-2 text-sm" htmlFor="import-skip-invalid">
                      <Checkbox
                        checked={store.skipInvalid}
                        id="import-skip-invalid"
                        onCheckedChange={(checked) => store.setSkipInvalid(checked === true)}
                      />

                      {t("DataTransfer.import.skipInvalid", { count: store.skippableCount })}
                    </label>
                  )}
                </div>
              )}
            </div>
          )}

          {store.step === "result" && store.summary && (
            <div className="space-y-2 text-sm">
              <p>
                {t("DataTransfer.import.resultCounts", {
                  created: store.summary.created,
                  updated: store.summary.updated,
                })}
              </p>

              {store.summary.skipped > 0 && (
                <p className="text-muted-foreground">
                  {t("DataTransfer.import.resultSkipped", { count: store.summary.skipped })}
                </p>
              )}

              {store.summary.stoppedAtSheetRow !== null && (
                <p className="text-destructive">
                  {t("DataTransfer.import.stopped", {
                    row: store.summary.stoppedAtSheetRow,
                    remaining: store.summary.notAttempted,
                  })}
                </p>
              )}

              {store.issues.length > 0 && <ImportIssueList issues={store.issues} />}
            </div>
          )}

          {store.isBusy && store.progressTotal > 0 && (
            <p className="text-xs text-muted-foreground">
              {t("DataTransfer.import.batchProgress", { done: store.progressDone, total: store.progressTotal })}
            </p>
          )}
        </AppCardBody>

        <AppCardFooter>
          {store.step === "mapping" && (
            <Button disabled={store.isBusy} type="button" variant="secondary" onClick={() => store.setStep("file")}>
              {t("Common.actions.back")}
            </Button>
          )}

          {store.step === "mapping" && (
            <Button
              disabled={store.isBusy || store.duplicateTargetCount > 0}
              id="import-validate"
              type="button"
              onClick={() => runUserAction(() => store.runDryRun())}
            >
              {t("DataTransfer.import.validate")}
            </Button>
          )}

          {store.step === "preview" && (
            <Button disabled={store.isBusy} type="button" variant="secondary" onClick={() => store.setStep("mapping")}>
              {t("Common.actions.back")}
            </Button>
          )}

          {store.step === "preview" && (
            <Button
              disabled={store.isBusy || store.hasBlockingIssues}
              id="import-commit"
              type="button"
              onClick={() => runUserAction(() => store.commit())}
            >
              {t("DataTransfer.import.commit")}
            </Button>
          )}

          {store.step === "result" && (
            <Button type="button" onClick={() => store.close()}>
              {t("Common.actions.close")}
            </Button>
          )}
        </AppCardFooter>
      </AppCard>
    </AppModal>
  );
});
