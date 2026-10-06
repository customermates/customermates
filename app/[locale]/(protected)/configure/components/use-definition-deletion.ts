"use client";

import type { ConfigurationChange } from "@/features/records/configuration.schema";
import type { RecordField, RecordModel, RecordType } from "@/features/records/record-model.schema";

import { useState } from "react";
import { useTranslations } from "next-intl";

import { useDeleteConfirmation } from "@/components/modal/hooks/use-delete-confirmation";
import { toastZodErrorTree } from "@/core/utils/toast-zod-error-tree";

import { applyRecordConfigurationAction, previewRecordConfigurationAction } from "../../records/actions";

type Target = { type: RecordType; field?: never } | { field: RecordField; type?: never };

export function useDefinitionDeletion(onDeleted: () => Promise<void>) {
  const t = useTranslations();
  const { showConfirmation } = useDeleteConfirmation();
  const [isPreviewing, setIsPreviewing] = useState(false);
  const requestDeletion = async (model: RecordModel, target: Target) => {
    if (isPreviewing) return;
    const change: ConfigurationChange = {
      expectedRevision: model.revision,
      idempotencyKey: crypto.randomUUID(),
      operations: [
        target.type
          ? { operation: "deleteType", typeId: target.type.id }
          : { operation: "deleteField", fieldId: target.field.id },
      ],
    };
    setIsPreviewing(true);
    try {
      const result = await previewRecordConfigurationAction(change);
      if (!result.ok) {
        toastZodErrorTree(result.error);
        return;
      }
      const preview = result.data;
      const impact = preview.deletion;
      const details = impact
        ? [
            impact.records > 0 && t("RecordModel.permanentDeletion.records", { count: impact.records }),
            impact.values > 0 && t("RecordModel.permanentDeletion.values", { count: impact.values }),
            impact.links > 0 && t("RecordModel.permanentDeletion.links", { count: impact.links }),
            impact.relationships > 0 &&
              t("RecordModel.permanentDeletion.relationships", { count: impact.relationships }),
            impact.views > 0 && t("RecordModel.permanentDeletion.views", { count: impact.views }),
            impact.grants > 0 && t("RecordModel.permanentDeletion.grants", { count: impact.grants }),
          ].filter((line): line is string => Boolean(line))
        : [];
      const listLabel = (typeId?: string) => model.types.find((type) => type.id === typeId)?.pluralLabel ?? "";
      const blockers = preview.issues.map((issue) => {
        const field = model.fields.find((candidate) => candidate.id === issue.fieldId);
        if (issue.code === "deletion_dependency") {
          return field
            ? t("RecordModel.permanentDeletion.dependentField", { field: field.label, list: listLabel(field.typeId) })
            : t("RecordModel.permanentDeletion.dependentList", { list: listLabel(issue.typeId) });
        }
        const label = field?.label ?? listLabel(issue.typeId);
        return label ? `${label}: ${t("RecordModel.dependencyHelp")}` : t("RecordModel.dependencyHelp");
      });
      const name = target.type ? target.type.pluralLabel : target.field.label;
      showConfirmation({
        title: target.type
          ? t("RecordModel.permanentDeletion.listTitle", { name })
          : t("RecordModel.permanentDeletion.fieldTitle", { name }),
        message: target.type
          ? t("RecordModel.permanentDeletion.listMessage")
          : t("RecordModel.permanentDeletion.fieldMessage"),
        details: details.length ? details : [t("RecordModel.permanentDeletion.nothingStored")],
        blockers: [...new Set(blockers)],
        confirmationText: name,
        onConfirm: async () => {
          const applied = await applyRecordConfigurationAction(change);
          if (!applied.ok) {
            toastZodErrorTree(applied.error);
            return false;
          }
          await onDeleted();
          return true;
        },
      });
    } finally {
      setIsPreviewing(false);
    }
  };
  return { requestDeletion, isPreviewing };
}
