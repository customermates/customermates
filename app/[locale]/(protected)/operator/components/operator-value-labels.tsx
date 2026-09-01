"use client";

import type { OperatorAuditSource } from "@/ee/operator/operator-lists.schema";

import { useTranslations } from "next-intl";

import { AppChip } from "@/components/chip/app-chip";
import { OPERATOR_AUDIT_ACTION } from "@/ee/operator/operator.schema";
import { OPERATOR_AUDIT_SOURCE } from "@/ee/operator/operator-lists.schema";

const OPERATOR_AUDIT_ACTION_KEY = Object.fromEntries(
  Object.entries(OPERATOR_AUDIT_ACTION).map(([name, action]) => [action, `OperatorAudit.values.action.${name}`]),
) as Record<string, string>;

export function AuditSourceChip({ source }: { source: OperatorAuditSource }) {
  const t = useTranslations();

  return (
    <AppChip size="sm" variant={source === "operator" ? "info" : "secondary"}>
      {source === "operator" ? t("OperatorAudit.values.source.operator") : t("OperatorAudit.values.source.product")}
    </AppChip>
  );
}

export function AuditActionLabel({ action, source }: { action: string; source: OperatorAuditSource }) {
  const t = useTranslations();

  if (source === OPERATOR_AUDIT_SOURCE.operator) {
    const key = OPERATOR_AUDIT_ACTION_KEY[action];
    return key ? t(key) : action;
  }

  return t(`Common.events.${action}`);
}
