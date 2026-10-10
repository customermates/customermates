"use client";

import type { TrashedRecordInfo } from "@/features/trash/trash.schema";

import { observer } from "mobx-react-lite";
import { useTranslations } from "next-intl";
import { Trash2 } from "lucide-react";

import { MemberChip } from "@/components/chip/member-chip";
import { Alert } from "@/components/shared/alert";
import { useHydratedIntlStore } from "@/core/stores/use-hydrated-intl-store";

export const RecordTrashBanner = observer(function RecordTrashBanner({ trash }: { trash: TrashedRecordInfo }) {
  const t = useTranslations();
  const intlStore = useHydratedIntlStore();
  return (
    <Alert
      className="mx-4 mt-3 w-auto md:mx-6"
      color="warning"
      data-record-trash-banner=""
      icon={<Trash2 />}
      title={t("Trash.inTrash")}
    >
      <span className="flex flex-wrap items-center gap-1.5 text-sm text-warning/90">
        {trash.deletedBy && <MemberChip member={trash.deletedBy} />}

        {t("Trash.bannerDeleted", {
          date: intlStore.formatNumericalShortDateTime(new Date(trash.deletedAt)),
          count: trash.daysLeft,
        })}
      </span>
    </Alert>
  );
});
