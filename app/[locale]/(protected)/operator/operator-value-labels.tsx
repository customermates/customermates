"use client";

import type { Status, SubscriptionPlan, SubscriptionStatus } from "@/generated/prisma";
import type { OperatorAuditSource } from "@/ee/operator/operator-lists.schema";

import { useTranslations } from "next-intl";

import { AppChip } from "@/components/chip/app-chip";
import { OPERATOR_AUDIT_ACTION } from "@/ee/operator/operator.schema";
import { OPERATOR_AUDIT_SOURCE } from "@/ee/operator/operator-lists.schema";

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

function OperatorAuditActionName({ action }: { action: string }) {
  const t = useTranslations();

  if (action === OPERATOR_AUDIT_ACTION.overviewRead) return t("OperatorAudit.values.action.overviewRead");
  if (action === OPERATOR_AUDIT_ACTION.candidateRead) return t("OperatorAudit.values.action.candidateRead");
  if (action === OPERATOR_AUDIT_ACTION.companyRead) return t("OperatorAudit.values.action.companyRead");
  if (action === OPERATOR_AUDIT_ACTION.auditRead) return t("OperatorAudit.values.action.auditRead");
  if (action === OPERATOR_AUDIT_ACTION.globalControlUpdate) return t("OperatorAudit.values.action.globalControlUpdate");
  if (action === OPERATOR_AUDIT_ACTION.enterpriseAllowanceUpdate)
    return t("OperatorAudit.values.action.enterpriseAllowanceUpdate");
  if (action === OPERATOR_AUDIT_ACTION.creditAdjustmentCreate)
    return t("OperatorAudit.values.action.creditAdjustmentCreate");
  if (action === OPERATOR_AUDIT_ACTION.userListRead) return t("OperatorAudit.values.action.userListRead");
  if (action === OPERATOR_AUDIT_ACTION.userSummaryRead) return t("OperatorAudit.values.action.userSummaryRead");
  if (action === OPERATOR_AUDIT_ACTION.userDetailRead) return t("OperatorAudit.values.action.userDetailRead");
  if (action === OPERATOR_AUDIT_ACTION.userStatusUpdate) return t("OperatorAudit.values.action.userStatusUpdate");
  if (action === OPERATOR_AUDIT_ACTION.userPlatformAccessUpdate)
    return t("OperatorAudit.values.action.userPlatformAccessUpdate");
  if (action === OPERATOR_AUDIT_ACTION.subscriptionSnapshotCorrect)
    return t("OperatorAudit.values.action.subscriptionSnapshotCorrect");
  if (action === OPERATOR_AUDIT_ACTION.creditBalanceReset) return t("OperatorAudit.values.action.creditBalanceReset");
  if (action === OPERATOR_AUDIT_ACTION.operatorBootstrap) return t("OperatorAudit.values.action.operatorBootstrap");

  return action;
}

export function AuditActionLabel({ action, source }: { action: string; source: OperatorAuditSource }) {
  const t = useTranslations();

  if (source === OPERATOR_AUDIT_SOURCE.operator) return <OperatorAuditActionName action={action} />;

  return t(`Common.events.${action}`);
}
