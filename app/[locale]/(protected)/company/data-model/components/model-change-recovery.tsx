"use client";

import { observer } from "mobx-react-lite";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { runUserAction } from "@/core/errors/report-application-error";

type RecoveryStore = {
  refreshRequired: boolean;
  refreshFailed: boolean;
  targetMissing: boolean;
  conflicts: readonly string[];
  isLoading: boolean;
  refreshModel(): Promise<void>;
  resolveConflicts(choice: "draft" | "latest"): void;
};

export const ModelChangeRecovery = observer(function ModelChangeRecovery({ store }: { store: RecoveryStore }) {
  const t = useTranslations();
  if (!store.refreshRequired && !store.refreshFailed && !store.targetMissing && !store.conflicts.length) return null;
  return (
    <div className="space-y-2 rounded-md border border-border bg-muted/50 p-3 text-sm" role="status">
      {store.targetMissing ? <p>{t("RecordModel.staleTargetMissing")}</p> : null}

      {store.refreshRequired && !store.targetMissing ? (
        <>
          <p>{store.refreshFailed ? t("RecordModel.staleRefreshFailed") : t("RecordModel.staleRefreshRequired")}</p>

          <Button
            disabled={store.isLoading}
            size="sm"
            type="button"
            variant="secondary"
            onClick={() => runUserAction(() => store.refreshModel())}
          >
            {t("RecordModel.staleRefresh")}
          </Button>
        </>
      ) : null}

      {store.conflicts.length ? (
        <>
          <p>{t("RecordModel.staleControlConflict")}</p>

          <div className="flex flex-wrap gap-2">
            <Button size="sm" type="button" variant="secondary" onClick={() => store.resolveConflicts("draft")}>
              {t("RecordModel.staleKeepDraft")}
            </Button>

            <Button size="sm" type="button" variant="secondary" onClick={() => store.resolveConflicts("latest")}>
              {t("RecordModel.staleLoadLatest")}
            </Button>
          </div>
        </>
      ) : null}
    </div>
  );
});
