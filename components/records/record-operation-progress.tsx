"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import type { z } from "zod";
import type { RecordOperationStatusSchema } from "@/features/records/record-operation.interactor";
import { Button } from "@/components/ui/button";
import { runUserAction } from "@/core/errors/report-application-error";
import { useRootStore } from "@/core/stores/root-store.provider";
import {
  cancelRecordOperationAction,
  getRecordOperationAction,
  resumeRecordOperationAction,
} from "@/app/[locale]/(protected)/records/actions";

export function RecordOperationProgress({
  operationId,
  onCompleted,
  onStopped,
}: {
  operationId: string;
  onCompleted: () => Promise<void>;
  onStopped: () => void;
}) {
  const t = useTranslations();
  const { trashStore } = useRootStore();
  const [status, setStatus] = useState<z.infer<typeof RecordOperationStatusSchema> | null>(null);
  const [failed, setFailed] = useState(false);
  const [retry, setRetry] = useState(0);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const poll = async () => {
      try {
        const result = await getRecordOperationAction(operationId);
        if (cancelled) return;
        if (!result.ok) {
          setFailed(true);
          return;
        }
        setStatus(result.data);
        setFailed(false);
        if (result.data.state === "completed") {
          const completed = result.data.result;
          if (completed?.status === "completed" && completed.trashBatchId)
            trashStore.announceMovedToTrash({ trashBatchId: completed.trashBatchId });
          await onCompleted();
          return;
        }
        if (result.data.state === "pending" || result.data.state === "staging") {
          timer = setTimeout(() => {
            void poll().catch(() => setFailed(true));
          }, 2000);
        }
      } catch {
        if (!cancelled) setFailed(true);
      }
    };
    void poll().catch(() => setFailed(true));
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [operationId, onCompleted, retry, trashStore]);
  const perform = async (action: "cancel" | "resume") => {
    setBusy(true);
    try {
      const result = await (action === "cancel"
        ? cancelRecordOperationAction(operationId)
        : resumeRecordOperationAction(operationId));
      if (!result.ok) {
        setFailed(true);
        return;
      }
      setRetry((value) => value + 1);
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  };
  const stopped = status?.state === "failed" || status?.state === "cancelled";
  return (
    <div className="space-y-3 rounded-md border border-border p-3">
      <p className="text-sm" role={failed || status?.state === "failed" ? "alert" : "status"}>
        {failed
          ? t("RecordModel.progressUnavailable")
          : stopped
            ? t(status.state === "failed" ? "RecordModel.operationFailed" : "RecordModel.operationCancelled")
            : t("RecordModel.operationPending")}
      </p>

      {status && status.total > 0 && !stopped && (
        <p className="text-xs text-muted-foreground">
          {t("RecordModel.operationProgress", { processed: status.processed, total: status.total })}
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        {failed && (
          <Button size="sm" type="button" variant="secondary" onClick={() => setRetry((value) => value + 1)}>
            {t("RecordModel.retry")}
          </Button>
        )}

        {stopped ? (
          <Button size="sm" type="button" variant="secondary" onClick={onStopped}>
            {t("RecordModel.returnToDraft")}
          </Button>
        ) : (
          <>
            <Button
              disabled={busy}
              size="sm"
              type="button"
              variant="secondary"
              onClick={() => {
                runUserAction(() => perform("resume"));
              }}
            >
              {t("RecordModel.resume")}
            </Button>

            <Button
              disabled={busy}
              size="sm"
              type="button"
              variant="ghost"
              onClick={() => {
                runUserAction(() => perform("cancel"));
              }}
            >
              {t("RecordModel.cancelOperation")}
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
