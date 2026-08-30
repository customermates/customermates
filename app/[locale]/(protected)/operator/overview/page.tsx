import type { Metadata } from "next";

import { getFormatter, getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { Activity, AlertTriangle, Building2, CircleDollarSign, Sparkles, Users } from "lucide-react";

import { PageContainer } from "@/components/shared/page-container";
import {
  getHostedAiOperatorOverviewInteractor,
  getOperatorConsoleVisibilityInteractor,
  getOperatorRiskSummaryInteractor,
  getOperatorUserSummaryInteractor,
} from "@/core/di";
import { appErrorDetails } from "@/core/errors/app-errors";

import { OperatorMetricCard } from "../operator-metric-card";

export async function generateMetadata(): Promise<Metadata> {
  const robots = { follow: false, index: false, noarchive: true, nosnippet: true };
  if (!(await getOperatorConsoleVisibilityInteractor().invoke())) return { robots };

  const t = await getTranslations("OperatorOverview");

  return { title: t("title"), description: t("description"), robots };
}

function microcentsAsDollars(value: string): number {
  return Number(BigInt(value)) / 100_000_000;
}

export default async function OperatorOverviewPage() {
  const t = await getTranslations();
  const format = await getFormatter();

  let overview;
  let summary;
  let risk;
  try {
    [overview, summary, risk] = await Promise.all([
      getHostedAiOperatorOverviewInteractor().invoke(),
      getOperatorUserSummaryInteractor().invoke(),
      getOperatorRiskSummaryInteractor().invoke(),
    ]);
  } catch (error) {
    if (appErrorDetails(error)) notFound();
    throw error;
  }

  const money = (microcents: string) =>
    format.number(microcentsAsDollars(microcents), {
      currency: "USD",
      maximumFractionDigits: 2,
      minimumFractionDigits: 2,
      style: "currency",
    });
  const integer = (value: number) => format.number(value, { maximumFractionDigits: 0 });
  const committed = microcentsAsDollars(overview.currentUtcMonth.totalCommittedMicrocents);
  const cap = overview.globalControl.monthlySpendCapMicrocents
    ? microcentsAsDollars(overview.globalControl.monthlySpendCapMicrocents)
    : null;
  const atRisk = risk.subscriptionsPastDue + risk.subscriptionsUnpaid + risk.subscriptionsExpired;

  return (
    <PageContainer>
      <div className="space-y-6">
        <div className="space-y-2">
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{t("OperatorOverview.title")}</h1>

          <p className="text-sm leading-6 text-muted-foreground sm:text-base">{t("OperatorOverview.description")}</p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <OperatorMetricCard
            description={
              cap === null
                ? t("OperatorOverview.spend.noCap")
                : t("OperatorOverview.spend.ofCap", {
                    cap: money(overview.globalControl.monthlySpendCapMicrocents ?? "0"),
                    percent: cap > 0 ? Math.min(100, Math.round((committed / cap) * 100)) : 0,
                  })
            }
            icon={CircleDollarSign}
            label={t("OperatorOverview.spend.label")}
            value={money(overview.currentUtcMonth.totalCommittedMicrocents)}
          />

          <OperatorMetricCard
            description={t("OperatorOverview.risk.description", { trials: risk.trialsEndingWithinSevenDays })}
            icon={AlertTriangle}
            label={t("OperatorOverview.risk.label")}
            value={integer(atRisk)}
          />

          <OperatorMetricCard
            description={t("OperatorOverview.workspaces.description", {
              enterprise: overview.fleet.enterpriseCompanies,
            })}
            icon={Building2}
            label={t("OperatorOverview.workspaces.label")}
            value={integer(summary.totalCompanies)}
          />

          <OperatorMetricCard
            description={t("OperatorOverview.users.description", {
              active: summary.byStatus.active,
              pending: summary.byStatus.pendingAuthorization,
            })}
            icon={Users}
            label={t("OperatorOverview.users.label")}
            value={integer(summary.totalUsers)}
          />

          <OperatorMetricCard
            description={t("OperatorOverview.activity.description", { total: summary.totalUsers })}
            icon={Activity}
            label={t("OperatorOverview.activity.label")}
            value={integer(risk.activeUsersLastSevenDays)}
          />

          <OperatorMetricCard
            description={t("OperatorOverview.growth.description", {
              workspaces: risk.newWorkspacesLastThirtyDays,
            })}
            icon={Sparkles}
            label={t("OperatorOverview.growth.label")}
            value={integer(risk.newUsersLastThirtyDays)}
          />

          <OperatorMetricCard
            description={t("OperatorOverview.reserved.description")}
            icon={CircleDollarSign}
            label={t("OperatorOverview.reserved.label")}
            value={money(overview.currentUtcMonth.reservedExposureMicrocents)}
          />

          <OperatorMetricCard
            description={t("OperatorOverview.operators.description")}
            icon={Users}
            label={t("OperatorOverview.operators.label")}
            value={integer(summary.platformOperators)}
          />
        </div>
      </div>
    </PageContainer>
  );
}
