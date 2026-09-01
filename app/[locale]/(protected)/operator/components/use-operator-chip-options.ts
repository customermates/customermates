"use client";

import type { ChipColor } from "@/constants/chip-colors";

import { useMemo } from "react";
import { useTranslations } from "next-intl";
import { Status, SubscriptionPlan, SubscriptionStatus } from "@/generated/prisma";

import { SUBSCRIPTION_STATUS_COLOR_MAP } from "@/app/[locale]/(protected)/company/components/subscription/subscription-panel";
import { USER_STATUS_COLORS_MAP } from "@/constants/user-statuses";

export type OperatorChipOption = { value: string; label: string; color: ChipColor };

export const PLATFORM_ACCESS_GRANTED = "true";

export function useOperatorChipOptions() {
  const t = useTranslations();

  return useMemo(
    () => ({
      accountStatus: Object.values(Status).map((status) => ({
        value: status,
        label: t(`Common.userStatuses.${status}`),
        color: USER_STATUS_COLORS_MAP[status],
      })),
      platformAccess: [
        { value: "false", label: t("OperatorUsers.platformAccess.revoked"), color: "secondary" as ChipColor },
        { value: PLATFORM_ACCESS_GRANTED, label: t("OperatorUsers.values.operator"), color: "info" as ChipColor },
      ],
      plan: Object.values(SubscriptionPlan).map((plan) => ({
        value: plan,
        label: t(`Subscription.planNames.${plan}`),
        color: "secondary" as ChipColor,
      })),
      subscription: Object.values(SubscriptionStatus).map((status) => ({
        value: status,
        label: t(`Subscription.status.${status}`),
        color: SUBSCRIPTION_STATUS_COLOR_MAP[status],
      })),
    }),
    [t],
  );
}
