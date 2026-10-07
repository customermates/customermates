"use client";

import type { ConfigurationChange } from "@/features/records/configuration.schema";
import type { RecordField, RecordModel, RecordType } from "@/features/records/record-model.schema";

import { useState } from "react";
import { useTranslations } from "next-intl";

import { useDeleteConfirmation } from "@/components/modal/hooks/use-delete-confirmation";
import { toastZodErrorTree } from "@/core/utils/toast-zod-error-tree";

import { applyRecordConfigurationAction, previewRecordConfigurationAction } from "../../records/actions";

type ChannelsBinding = RecordModel["capabilities"][number];
type Target =
  | { type: RecordType; field?: never; channels?: never }
  | { field: RecordField; type?: never; channels?: never }
  | { channels: ChannelsBinding; type?: never; field?: never };

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
          : target.field
            ? { operation: "deleteField", fieldId: target.field.id }
            : { operation: "deleteCapability", capabilityId: target.channels.id },
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
            impact.identifiers > 0 &&
              t("RecordModel.permanentDeletion.identifiers", {
                count: impact.identifiers,
                records: impact.identifierRecords,
              }),
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
      const name = target.type
        ? target.type.pluralLabel
        : target.field
          ? target.field.label
          : t("EntityChannels.heading");
      showConfirmation({
        title: target.type
          ? t("RecordModel.permanentDeletion.listTitle", { name })
          : t("RecordModel.permanentDeletion.fieldTitle", { name }),
        message: target.type
          ? t("RecordModel.permanentDeletion.listMessage")
          : target.field
            ? t("RecordModel.permanentDeletion.fieldMessage")
            : t("RecordModel.permanentDeletion.channelsMessage"),
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
  const setChannelsEnabled = async (model: RecordModel, binding: ChannelsBinding, enabled: boolean) => {
    const applied = await applyRecordConfigurationAction({
      expectedRevision: model.revision,
      idempotencyKey: crypto.randomUUID(),
      operations: [{ operation: "putCapability", capability: { ...binding, enabled } }],
    });
    if (!applied.ok) {
      toastZodErrorTree(applied.error);
      return false;
    }
    await onDeleted();
    return true;
  };
  const requestChannelsRemoval = (model: RecordModel, binding: ChannelsBinding) =>
    showConfirmation({
      title: t("RecordModel.channelsField.deleteTitle"),
      message: t("RecordModel.channelsField.deleteMessage"),
      onConfirm: () => setChannelsEnabled(model, binding, false),
    });
  const restoreChannels = async (model: RecordModel, binding: ChannelsBinding) => {
    await setChannelsEnabled(model, binding, true);
  };
  return { requestDeletion, requestChannelsRemoval, restoreChannels, isPreviewing };
}
