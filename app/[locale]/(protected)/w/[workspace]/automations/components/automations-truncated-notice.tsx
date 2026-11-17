"use client";

import { useTranslations } from "next-intl";

import { Alert } from "@/components/shared/alert";
import {
  AUTOMATION_LIST_ROUTINE_CAP,
  AUTOMATION_LIST_RULE_CAP,
} from "@/features/automation-rules/automations-list.schema";

export function AutomationsTruncatedNotice({ truncated }: { truncated: boolean }) {
  const t = useTranslations();
  if (!truncated) return null;

  return (
    <div className="px-4 pt-3 md:px-6" data-automations-truncated="">
      <Alert
        description={t("Automations.truncated", {
          rules: AUTOMATION_LIST_RULE_CAP,
          routines: AUTOMATION_LIST_ROUTINE_CAP,
        })}
        variant="info"
      />
    </div>
  );
}
