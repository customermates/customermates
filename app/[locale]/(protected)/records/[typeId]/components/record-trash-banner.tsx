"use client";

import type { TrashedRecordInfo } from "@/features/trash/trash.schema";

import { observer } from "mobx-react-lite";
import { useTranslations } from "next-intl";
import { LoaderCircle, Trash2 } from "lucide-react";

import { MemberChip } from "@/components/chip/member-chip";
import { Alert } from "@/components/shared/alert";
import { useHydratedIntlStore } from "@/core/stores/use-hydrated-intl-store";
import { useRootStore } from "@/core/stores/root-store.provider";

export const RecordTrashBanner = observer(function RecordTrashBanner({ trash }: { trash: TrashedRecordInfo }) {
  const t = useTranslations();
  const intlStore = useHydratedIntlStore();
  const { trashStore } = useRootStore();
  const restoring = trashStore.isRestoring(trash.itemId);
  return (
    <Alert
      aria-busy={restoring || undefined}
      className="mx-4 my-3 w-auto md:mx-6"
      color="warning"
      data-record-trash-banner=""
      icon={restoring ? <LoaderCircle className="animate-spin" /> : <Trash2 />}
    >
      <span className="flex min-h-5 flex-wrap items-center gap-x-1.5 gap-y-1 text-sm text-warning/90">
        <span className="font-medium text-warning">{restoring ? t("Trash.restoring") : t("Trash.inTrash")}</span>

        {!restoring && (
          <>
            <span aria-hidden>·</span>

            {trash.deletedBy && <MemberChip member={trash.deletedBy} />}

            {t("Trash.bannerDeleted", {
              date: intlStore.formatNumericalShortDateTime(new Date(trash.deletedAt)),
              count: trash.daysLeft,
            })}
          </>
        )}
      </span>
    </Alert>
  );
});
