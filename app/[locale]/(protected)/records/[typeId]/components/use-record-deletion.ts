"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import type { RecordDto } from "@/features/records/record-model.schema";
import type { RecordMutation } from "@/features/records/record-query.schema";
import { useDeleteConfirmation } from "@/components/modal/hooks/use-delete-confirmation";
import { toastZodErrorTree } from "@/core/utils/toast-zod-error-tree";
import { previewRecordDeletionAction, mutateRecordAction } from "../../actions";

export function useRecordDeletion({
  onDeleted,
  onPending,
  mutateMany,
}: {
  onDeleted: () => Promise<void>;
  onPending: (operationId: string) => void;
  mutateMany?: (mutation: Extract<RecordMutation, { action: "deleteMany" }>) => Promise<boolean>;
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
  const request = async (
    targets: Array<{ ref: RecordDto["ref"]; expectedVersion: number }>,
    schemaRevision: number,
    name: string,
    many: boolean,
  ) => {
    if (isPreviewing) return;
    setIsPreviewing(true);
    try {
      const input = many
        ? { targets, expectedRevision: schemaRevision }
        : { ...targets[0], expectedRevision: schemaRevision };
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
          if (many && mutateMany) {
            return mutateMany({
              action: "deleteMany",
              targets,
              expectedImpactHash: preview.impactHash,
            });
          }
          const idempotencyKey = requests.current.get(payloadKey) ?? crypto.randomUUID();
          requests.current.set(payloadKey, idempotencyKey);
          const result = await mutateRecordAction({
            expectedRevision: input.expectedRevision,
            idempotencyKey,
            mutation: {
              action: "delete",
              ref: targets[0].ref,
              expectedVersion: targets[0].expectedVersion,
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
  return {
    requestDeletion: (record: RecordDto, revision: number, name: string) =>
      request(
        [
          {
            ref: { typeId: record.ref.typeId, recordId: record.ref.recordId },
            expectedVersion: record.version,
          },
        ],
        revision,
        name,
        false,
      ),
    requestMany: (targets: Array<{ ref: RecordDto["ref"]; expectedVersion: number }>, revision: number) =>
      request(targets, revision, t("MassActions.selectedCount", { count: targets.length }), true),
    isPreviewing,
  };
}
