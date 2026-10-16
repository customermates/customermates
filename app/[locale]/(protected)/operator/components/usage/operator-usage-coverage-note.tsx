"use client";

import type { BillingUsageCoverage } from "@/ee/operator/billing-usage.schema";

import { useTranslations } from "next-intl";

import { useHydratedIntlStore } from "@/core/stores/use-hydrated-intl-store";

type Props = { coverage: BillingUsageCoverage; kind: "seats" | "channels"; monthStart: Date };

export function OperatorUsageCoverageNote({ coverage, kind, monthStart }: Props) {
  const t = useTranslations();
  const intlStore = useHydratedIntlStore();
  if (coverage.complete) return null;

  return (
    <div className="flex flex-col gap-1 text-xs text-warning">
      {coverage.recordedFrom && coverage.recordedFrom > monthStart ? (
        <span>
          {kind === "seats"
            ? t("OperatorUsage.coverage.seatsRecordedFrom", {
                date: intlStore.formatNumericalShortDateTime(coverage.recordedFrom, { timeZone: "UTC" }),
              })
            : t("OperatorUsage.coverage.channelsRecordedFrom", {
                date: intlStore.formatNumericalShortDateTime(coverage.recordedFrom, { timeZone: "UTC" }),
              })}
        </span>
      ) : null}

      {coverage.inexactTimes ? <span>{t("OperatorUsage.coverage.inexactTimes")}</span> : null}
    </div>
  );
}
