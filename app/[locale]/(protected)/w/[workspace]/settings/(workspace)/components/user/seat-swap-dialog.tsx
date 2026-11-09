"use client";

import type { MemberDto } from "@/features/user/user.schema";

import { useState } from "react";
import { useTranslations } from "next-intl";

import { ConfirmDialog } from "@/components/modal/confirm-dialog";
import { toastZodErrorTree } from "@/core/utils/toast-zod-error-tree";

import { swapFreePlanSeatAction } from "../../actions";
import { memberName } from "./user-modal";

type Props = {
  target: MemberDto | null;
  isAdmin: boolean;
  onClose: () => void;
};

export function SeatSwapDialog({ target, isAdmin, onClose }: Props) {
  const t = useTranslations();
  const [busy, setBusy] = useState(false);
  const name = target ? memberName(target) : "";

  return (
    <ConfirmDialog
      anchorScope="seat-swap-confirm"
      busy={busy}
      confirmDisabled={!isAdmin}
      confirmLabel={t("PlanPause.swapConfirm")}
      confirmVariant="ink"
      description={isAdmin ? t("PlanPause.swapDescription", { name }) : t("PlanPause.swapNeedsAdmin", { name })}
      open={target !== null}
      title={t("PlanPause.swapTitle", { name })}
      onCancel={onClose}
      onConfirm={async () => {
        if (!target) return;
        setBusy(true);
        const result = await swapFreePlanSeatAction({ userId: target.id });
        if (!result.ok) {
          setBusy(false);
          toastZodErrorTree(result.error);
          return;
        }
        window.location.reload();
      }}
    />
  );
}
