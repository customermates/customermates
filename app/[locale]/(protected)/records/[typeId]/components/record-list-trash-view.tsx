"use client";

import type { TrashedRecordInfo } from "@/features/trash/trash.schema";

import { observer } from "mobx-react-lite";
import { useTranslations } from "next-intl";
import { RotateCcw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { runUserAction } from "@/core/errors/report-application-error";
import { useRootStore } from "@/core/stores/root-store.provider";
import { useRouter } from "@/i18n/navigation";

import { RecordTrashBanner } from "./record-trash-banner";

type Props = { label: string; trash: TrashedRecordInfo };

const RecordListTrashContent = observer(function RecordListTrashContent({ label, trash }: Props) {
  const t = useTranslations();
  const router = useRouter();
  const { trashStore } = useRootStore();
  const busy = trashStore.isMutating || trashStore.isRestoring(trash.itemId);
  return (
    <div className="flex flex-col py-3" data-record-list-trash="">
      <h1 className="px-4 text-lg font-semibold md:px-6">{label}</h1>

      <RecordTrashBanner trash={trash} />

      {trash.canRestore && (
        <div className="px-4 md:px-6">
          <Button
            disabled={busy}
            id="record-list-restore"
            variant="secondary"
            onClick={() => runUserAction(() => trashStore.restoreItems([trash.itemId], () => router.refresh()))}
          >
            <RotateCcw />

            {t("Trash.restore")}
          </Button>
        </div>
      )}
    </div>
  );
});

export function RecordListTrashView(props: Props) {
  return <RecordListTrashContent {...props} />;
}
