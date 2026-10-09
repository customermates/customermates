"use client";

import type { TrashedRecordInfo } from "@/features/trash/trash.schema";

import { observer } from "mobx-react-lite";
import { useTranslations } from "next-intl";
import { RotateCcw, Trash2 } from "lucide-react";

import { MemberChip } from "@/components/chip/member-chip";
import { Alert } from "@/components/shared/alert";
import { Button } from "@/components/ui/button";
import { useRootStore } from "@/core/stores/root-store.provider";
import { runUserAction } from "@/core/errors/report-application-error";
import { useHydratedIntlStore } from "@/core/stores/use-hydrated-intl-store";
import { useRouter } from "@/i18n/navigation";

export const RecordTrashBanner = observer(function RecordTrashBanner({ trash }: { trash: TrashedRecordInfo }) {
  const t = useTranslations();
  const router = useRouter();
  const intlStore = useHydratedIntlStore();
  const { trashStore } = useRootStore();
  return (
    <Alert
      className="mx-4 mt-3 w-auto md:mx-6"
      color="warning"
      data-record-trash-banner=""
      icon={<Trash2 />}
      title={t("Trash.inTrash")}
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <span className="flex flex-wrap items-center gap-1.5 text-sm text-warning/90">
          {trash.deletedBy && <MemberChip member={trash.deletedBy} />}

          {t("Trash.bannerDeleted", {
            date: intlStore.formatNumericalShortDateTime(trash.deletedAt),
            count: trash.daysLeft,
          })}
        </span>

        {trash.canRestore && (
          <Button
            disabled={trashStore.isMutating}
            size="sm"
            type="button"
            variant="secondary"
            onClick={() =>
              runUserAction(async () => {
                if (await trashStore.restoreItems([trash.itemId])) router.refresh();
              })
            }
          >
            <RotateCcw className="size-4" />

            {t("Trash.restore")}
          </Button>
        )}
      </div>
    </Alert>
  );
});
