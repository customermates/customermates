"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import type { RecordDto } from "@/features/records/record-model.schema";
import { useDeleteConfirmation } from "@/components/modal/hooks/use-delete-confirmation";
import { toastZodErrorTree } from "@/core/utils/toast-zod-error-tree";
import { previewRecordDeletionAction, mutateRecordAction } from "../../actions";

export function useRecordDeletion({
  onDeleted,
  onPending,
}: {
  onDeleted: () => Promise<void>;
  onPending: (operationId: string) => void;
}) {
  const t = useTranslations();
  const { showConfirmation } = useDeleteConfirmation();
  const [isPreviewing, setIsPreviewing] = useState(false);
  const mounted = useRef(true);
  const requests = useRef(new Map<string, string>());
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const requestDeletion = async (record: RecordDto, schemaRevision: number, name: string) => {
    if (isPreviewing) return;
    setIsPreviewing(true);
    try {
      const input = {
        ref: { typeId: record.ref.typeId, recordId: record.ref.recordId },
        expectedVersion: record.version,
        expectedRevision: schemaRevision,
      };
      const result = await previewRecordDeletionAction(input);
      if (!mounted.current) return;
      if (!result.ok) {
        toastZodErrorTree(result.error);
        return;
      }
      const preview = result.data;
      const description = [
        t("RecordModel.deletionRecords", {
          records: preview.removedRecords.map((type) => `${type.label}: ${type.count}`).join("; "),
        }),
        preview.removedLinks === null
          ? t("RecordModel.deletionRestrictedLinks")
          : t("RecordModel.deletionLinks", { count: preview.removedLinks }),
        ...(preview.calculations.length
          ? [
              t("RecordModel.deletionCalculations", {
                fields: [...new Set(preview.calculations.map((field) => field.label))].join(", "),
              }),
            ]
          : []),
      ].join(" ");
      const payloadKey = JSON.stringify([input, preview.impactHash]);
      showConfirmation({
        title: t("RecordModel.deleteRecord", { name }),
        message: description,
        successKey: "RecordModel.deletionAccepted",
        onConfirm: async () => {
          const idempotencyKey = requests.current.get(payloadKey) ?? crypto.randomUUID();
          requests.current.set(payloadKey, idempotencyKey);
          const result = await mutateRecordAction({
            expectedRevision: input.expectedRevision,
            idempotencyKey,
            mutation: {
              action: "delete",
              ref: input.ref,
              expectedVersion: input.expectedVersion,
              expectedImpactHash: preview.impactHash,
            },
          });
          if (!result.ok) {
            toastZodErrorTree(result.error);
            return false;
          }
          requests.current.delete(payloadKey);
          if (result.data.status === "pending") onPending(result.data.operationId);
          else await onDeleted();
          return true;
        },
      });
    } finally {
      if (mounted.current) setIsPreviewing(false);
    }
  };
  return { requestDeletion, isPreviewing };
}
