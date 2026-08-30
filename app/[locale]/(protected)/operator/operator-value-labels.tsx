"use client";

import type { Status, SubscriptionPlan, SubscriptionStatus } from "@/generated/prisma";
import type { OperatorAuditSource } from "@/ee/operator/operator-lists.schema";

import { useTranslations } from "next-intl";

import { AppChip } from "@/components/chip/app-chip";

type ChipVariant = "secondary" | "success" | "warning" | "destructive" | "info";

function accountStatusVariant(status: Status): ChipVariant {
  if (status === "active") return "success";
  if (status === "inactive") return "destructive";

  return "warning";
}

function subscriptionVariant(status: SubscriptionStatus): ChipVariant {
  if (status === "active") return "success";
  if (status === "trial") return "info";
  if (status === "cancelled" || status === "expired") return "secondary";

  return "destructive";
}

export function AccountStatusChip({ status }: { status: Status }) {
  const t = useTranslations();
  const label =
    status === "active"
      ? t("OperatorUsers.values.accountStatus.active")
      : status === "inactive"
        ? t("OperatorUsers.values.accountStatus.inactive")
        : t("OperatorUsers.values.accountStatus.pendingAuthorization");

  return (
    <AppChip size="sm" variant={accountStatusVariant(status)}>
      {label}
    </AppChip>
  );
}

export function PlanChip({ plan }: { plan: SubscriptionPlan | null }) {
  const t = useTranslations();
  if (!plan) return <span className="text-sm text-muted-foreground">{t("OperatorUsers.values.noSubscription")}</span>;

  const label =
    plan === "starter"
      ? t("OperatorConsole.values.plans.starter")
      : plan === "pro"
        ? t("OperatorConsole.values.plans.pro")
        : plan === "business"
          ? t("OperatorConsole.values.plans.business")
          : t("OperatorConsole.values.plans.enterprise");

  return (
    <AppChip size="sm" variant="secondary">
      {label}
    </AppChip>
  );
}

export function SubscriptionChip({ status }: { status: SubscriptionStatus | null }) {
  const t = useTranslations();
  if (!status) return <span className="text-sm text-muted-foreground">{t("OperatorUsers.values.noSubscription")}</span>;

  const label =
    status === "trial"
      ? t("OperatorConsole.values.subscription.trial")
      : status === "active"
        ? t("OperatorConsole.values.subscription.active")
        : status === "cancelled"
          ? t("OperatorConsole.values.subscription.cancelled")
          : status === "expired"
            ? t("OperatorConsole.values.subscription.expired")
            : status === "pastDue"
              ? t("OperatorConsole.values.subscription.pastDue")
              : t("OperatorConsole.values.subscription.unPaid");

  return (
    <AppChip size="sm" variant={subscriptionVariant(status)}>
      {label}
    </AppChip>
  );
}

export function OperatorChip({ isPlatformOperator }: { isPlatformOperator: boolean }) {
  const t = useTranslations();
  if (!isPlatformOperator) return <span className="text-sm text-muted-foreground">{t("OperatorUsers.values.no")}</span>;

  return (
    <AppChip size="sm" variant="info">
      {t("OperatorUsers.values.operator")}
    </AppChip>
  );
}

export function AuditSourceChip({ source }: { source: OperatorAuditSource }) {
  const t = useTranslations();

  return (
    <AppChip size="sm" variant={source === "operator" ? "info" : "secondary"}>
      {source === "operator" ? t("OperatorAudit.values.source.operator") : t("OperatorAudit.values.source.product")}
    </AppChip>
  );
}
