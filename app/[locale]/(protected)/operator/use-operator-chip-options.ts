"use client";

import type { OperatorChipOption } from "./operator-chip-select";

import { useTranslations } from "next-intl";
import { Status, SubscriptionPlan, SubscriptionStatus } from "@/generated/prisma";

export const PLATFORM_ACCESS_GRANTED = "true";

export function useOperatorChipOptions() {
  const t = useTranslations();

  const accountStatus: OperatorChipOption[] = [
    { value: Status.active, label: t("OperatorUsers.values.accountStatus.active"), variant: "success" },
    { value: Status.inactive, label: t("OperatorUsers.values.accountStatus.inactive"), variant: "destructive" },
    {
      value: Status.pendingAuthorization,
      label: t("OperatorUsers.values.accountStatus.pendingAuthorization"),
      variant: "warning",
    },
  ];

  const platformAccess: OperatorChipOption[] = [
    { value: "false", label: t("OperatorUsers.platformAccess.revoked"), variant: "secondary" },
    { value: PLATFORM_ACCESS_GRANTED, label: t("OperatorUsers.values.operator"), variant: "info" },
  ];

  const plan: OperatorChipOption[] = [
    { value: SubscriptionPlan.starter, label: t("OperatorConsole.values.plans.starter"), variant: "secondary" },
    { value: SubscriptionPlan.pro, label: t("OperatorConsole.values.plans.pro"), variant: "secondary" },
    { value: SubscriptionPlan.business, label: t("OperatorConsole.values.plans.business"), variant: "secondary" },
    { value: SubscriptionPlan.enterprise, label: t("OperatorConsole.values.plans.enterprise"), variant: "secondary" },
  ];

  const subscription: OperatorChipOption[] = [
    { value: SubscriptionStatus.trial, label: t("OperatorConsole.values.subscription.trial"), variant: "info" },
    { value: SubscriptionStatus.active, label: t("OperatorConsole.values.subscription.active"), variant: "success" },
    {
      value: SubscriptionStatus.cancelled,
      label: t("OperatorConsole.values.subscription.cancelled"),
      variant: "secondary",
    },
    {
      value: SubscriptionStatus.expired,
      label: t("OperatorConsole.values.subscription.expired"),
      variant: "secondary",
    },
    {
      value: SubscriptionStatus.pastDue,
      label: t("OperatorConsole.values.subscription.pastDue"),
      variant: "destructive",
    },
    {
      value: SubscriptionStatus.unPaid,
      label: t("OperatorConsole.values.subscription.unPaid"),
      variant: "destructive",
    },
  ];

  return { accountStatus, platformAccess, plan, subscription };
}
