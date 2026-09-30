"use client";

import { useTranslations } from "next-intl";

import type { ConfigurationPreview } from "@/features/records/configuration.schema";
import type { RecordModel } from "@/features/records/record-model.schema";

export function RecordConfigurationPreview({ preview, model }: { preview: ConfigurationPreview; model: RecordModel }) {
  const t = useTranslations();
  return (
    <div className="space-y-2 rounded-md border border-border p-3 text-sm" role="status">
      <p>
        {preview.valid
          ? t("RecordModel.previewReady", { count: preview.affectedRecords })
          : t("RecordModel.invalidConfiguration")}
      </p>

      {preview.dataValidation === "staged" && (
        <p className="text-muted-foreground">{t("RecordModel.stagedValidation")}</p>
      )}

      {preview.issues.length > 0 && (
        <ul className="space-y-1">
          {preview.issues.map((issue, index) => {
            const label =
              model.fields.find((field) => field.id === issue.fieldId)?.label ??
              model.relationships.find((relation) => relation.id === issue.relationId)?.sourceLabel ??
              model.types.find((type) => type.id === issue.typeId)?.pluralLabel;
            return (
              <li key={index}>
                {label && <span className="font-medium">{label}: </span>}

                {t(
                  issue.code === "existing_values_incompatible"
                    ? "RecordModel.existingValuesIncompatible"
                    : issue.code === "saved_view_incompatible"
                      ? "RecordModel.savedViewIncompatible"
                      : issue.code === "detail_layout_incompatible"
                        ? "RecordModel.detailLayoutIncompatible"
                        : "RecordModel.dependencyHelp",
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
