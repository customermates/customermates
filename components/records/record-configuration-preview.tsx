"use client";

import { useTranslations } from "next-intl";

import type { ConfigurationPreview } from "@/features/records/configuration.schema";
import type { RecordModelView } from "@/features/records/record-model.schema";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";

export function RecordConfigurationPreview({
  preview,
  model,
  renewal,
}: {
  preview: ConfigurationPreview;
  model: RecordModelView;
  renewal?: { fieldIds: string[]; approved: boolean; disabled: boolean; onChange: (approved: boolean) => void };
}) {
  const t = useTranslations();
  return (
    <div className="space-y-2 text-sm" role="status">
      {preview.valid && (
        <p className="font-medium">
          {preview.affectedRecords === null
            ? t("RecordModel.previewReadyHidden")
            : t("RecordModel.previewReady", { count: preview.affectedRecords })}
        </p>
      )}

      {preview.dataValidation === "staged" && (
        <p className="text-muted-foreground">{t("RecordModel.stagedValidation")}</p>
      )}

      {renewal && (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Checkbox
              aria-describedby="renew-published-summaries-help"
              checked={renewal.approved}
              disabled={renewal.disabled}
              id="renew-published-summaries"
              onCheckedChange={(checked) => renewal.onChange(checked === true)}
            />

            <Label htmlFor="renew-published-summaries">{t("RecordModel.renewPublishedSummaries")}</Label>
          </div>

          <p className="text-xs text-muted-foreground" id="renew-published-summaries-help">
            {t("RecordModel.renewPublishedSummariesHelp")}
          </p>

          <ul className="space-y-1 text-xs text-muted-foreground">
            {renewal.fieldIds.map((fieldId) => {
              const field = model.fields.find((candidate) => candidate.id === fieldId);
              const type = model.types.find((candidate) => candidate.id === field?.typeId);
              return field ? (
                <li key={fieldId}>{[type?.pluralLabel, field.label].filter(Boolean).join(": ")}</li>
              ) : null;
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
