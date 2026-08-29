"use client";

import type {
  HostedAiGlobalControlDto,
  HostedAiOperatorCandidateDto,
  HostedAiOperatorCompanyDto,
  HostedAiOperatorOverviewDto,
  OperatorAuditEventDto,
  OperatorAuditPageDto,
} from "@/ee/operator/operator.schema";
import type { FormEvent } from "react";
import type { OperatorActionErrorCode, OperatorActionState } from "./actions";
import type { LucideIcon } from "lucide-react";

import {
  AlertCircle,
  Ban,
  Building2,
  CheckCircle2,
  CircleDollarSign,
  Clock3,
  Gauge,
  History,
  Mail,
  Search,
  ShieldAlert,
  SlidersHorizontal,
  Sparkles,
  UserCheck,
  Users,
} from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";

import {
  createCreditAdjustmentAction,
  findHostedAiCandidateAction,
  loadOperatorAuditEventsAction,
  updateEnterpriseAllowanceAction,
  updateGlobalControlAction,
} from "./actions";
import { microcentsAsDollarInput } from "./operator-form-values";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { runUserAction } from "@/core/errors/report-application-error";
import { useRouter } from "@/i18n/navigation";

type Props = {
  overview: HostedAiOperatorOverviewDto;
  audit: OperatorAuditPageDto;
  globalControlsEnabled: boolean;
  initialOperationIds: {
    adjustment: string;
    allowance: string;
    globalControl: string;
  };
};

type OperatorServerAction<T> = (
  previous: OperatorActionState<T>,
  formData: FormData,
) => Promise<OperatorActionState<T>>;

type SuccessHandler<T> = (data: T) => void;

function useOperatorForm<T>(action: OperatorServerAction<T>, onSuccess?: SuccessHandler<T>, onStart?: () => void) {
  const [state, setState] = useState<OperatorActionState<T>>({
    status: "idle",
  });
  const [pending, setPending] = useState(false);
  const latestState = useRef(state);
  latestState.current = state;

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;

    const formData = new FormData(event.currentTarget);
    onStart?.();
    setState({ status: "idle" });
    setPending(true);

    runUserAction(async () => {
      try {
        const next = await action(latestState.current, formData);
        latestState.current = next;
        setState(next);
        if (next.status === "success") onSuccess?.(next.data);
      } catch {
        const operationId = formData.get("operationId");
        const next: OperatorActionState<T> = {
          status: "error",
          errorCode: "unexpected",
          operationId: typeof operationId === "string" && operationId ? operationId : undefined,
        };
        latestState.current = next;
        setState(next);
      } finally {
        setPending(false);
      }
    });
  }

  return { onSubmit, pending, state };
}

function freshOperationId(): string {
  return globalThis.crypto.randomUUID();
}

function microcentsAsDollars(value: string): number {
  return Number(BigInt(value)) / 100_000_000;
}

function idSummary(value: string): string {
  return value.length <= 12 ? value : `${value.slice(0, 8)}…${value.slice(-4)}`;
}

export function HostedAiOperatorConsole({ overview, audit, globalControlsEnabled, initialOperationIds }: Props) {
  const t = useTranslations();
  const format = useFormatter();
  const router = useRouter();
  const [candidate, setCandidate] = useState<HostedAiOperatorCandidateDto | null>(null);
  const [candidateSearched, setCandidateSearched] = useState(false);
  const [control, setControl] = useState(overview.globalControl);

  useEffect(() => setControl(overview.globalControl), [overview.globalControl]);

  const money = (microcents: string) =>
    format.number(microcentsAsDollars(microcents), {
      currency: "USD",
      maximumFractionDigits: 2,
      minimumFractionDigits: 2,
      style: "currency",
    });
  const integer = (value: number) => format.number(value, { maximumFractionDigits: 0 });
  const dateTime = (value: string) =>
    format.dateTime(new Date(value), {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: "UTC",
    });
  const date = (value: string) => format.dateTime(new Date(value), { dateStyle: "medium", timeZone: "UTC" });

  const committed = microcentsAsDollars(overview.currentUtcMonth.totalCommittedMicrocents);
  const cap = control.monthlySpendCapMicrocents ? microcentsAsDollars(control.monthlySpendCapMicrocents) : null;
  const capPercent = cap && cap > 0 ? Math.min(100, (committed / cap) * 100) : 0;
  const statusVariant = !globalControlsEnabled
    ? "warning"
    : control.hostedProviderWorkPaused || control.monthlySpendCapMicrocents === null
      ? "destructive"
      : "success";
  const statusLabel = !globalControlsEnabled
    ? t("OperatorConsole.status.enforcementDisabled")
    : control.hostedProviderWorkPaused
      ? t("OperatorConsole.status.paused")
      : control.monthlySpendCapMicrocents === null
        ? t("OperatorConsole.status.configurationUnavailable")
        : t("OperatorConsole.status.available");

  return (
    <div className="flex min-w-0 flex-col gap-6">
      <section
        aria-labelledby="operator-title"
        className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between"
      >
        <div className="max-w-3xl space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={statusVariant}>
              {!globalControlsEnabled ? (
                <ShieldAlert aria-hidden />
              ) : control.hostedProviderWorkPaused || control.monthlySpendCapMicrocents === null ? (
                <Ban aria-hidden />
              ) : (
                <CheckCircle2 aria-hidden />
              )}

              {statusLabel}
            </Badge>
          </div>

          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl" id="operator-title">
            {t("OperatorConsole.title")}
          </h1>

          <p className="text-sm leading-6 text-muted-foreground sm:text-base">{t("OperatorConsole.description")}</p>
        </div>

        <p className="flex shrink-0 items-center gap-2 text-xs text-muted-foreground">
          <Clock3 aria-hidden className="size-3.5" />

          {t("OperatorConsole.overview.generatedAt", { date: dateTime(overview.generatedAt) })}
        </p>
      </section>

      <section aria-labelledby="fleet-heading" className="space-y-3">
        <h2 className="sr-only" id="fleet-heading">
          {t("OperatorConsole.overview.heading")}
        </h2>

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <MetricCard
            description={t("OperatorConsole.overview.committedDescription")}
            icon={CircleDollarSign}
            label={t("OperatorConsole.overview.committed")}
            value={money(overview.currentUtcMonth.totalCommittedMicrocents)}
          />

          <MetricCard
            description={t("OperatorConsole.overview.reservedDescription")}
            icon={Gauge}
            label={t("OperatorConsole.overview.reserved")}
            value={money(overview.currentUtcMonth.reservedExposureMicrocents)}
          />

          <MetricCard
            description={t("OperatorConsole.overview.companiesDescription", {
              active: integer(overview.currentUtcMonth.companiesWithUsage),
              enterprise: integer(overview.fleet.enterpriseCompanies),
            })}
            icon={Building2}
            label={t("OperatorConsole.overview.companies")}
            value={integer(overview.fleet.companies)}
          />

          <MetricCard
            description={t("OperatorConsole.overview.usersDescription", {
              total: integer(overview.fleet.users),
            })}
            icon={Users}
            label={t("OperatorConsole.overview.activeUsers")}
            value={integer(overview.fleet.activeUsers)}
          />
        </div>
      </section>

      <section className="grid items-start gap-6 xl:grid-cols-[minmax(0,1.15fr)_minmax(22rem,0.85fr)]">
        <GlobalControlCard
          capPercent={capPercent}
          control={control}
          enabled={globalControlsEnabled}
          formatDateTime={dateTime}
          formatMoney={money}
          initialOperationId={initialOperationIds.globalControl}
          onUpdated={(next) => {
            setControl(next);
            router.refresh();
          }}
        />

        <CandidateSearchCard
          candidate={candidate}
          searched={candidateSearched}
          onFound={(next) => {
            setCandidateSearched(true);
            setCandidate(next);
          }}
        />
      </section>

      {candidate ? (
        <CompanyPanel
          candidate={candidate}
          formatDate={date}
          formatMoney={money}
          initialAdjustmentOperationId={initialOperationIds.adjustment}
          initialAllowanceOperationId={initialOperationIds.allowance}
          integer={integer}
          onCandidateChange={setCandidate}
          onMutated={() => router.refresh()}
        />
      ) : null}

      <AuditReport formatDateTime={dateTime} initialPage={audit} />
    </div>
  );
}

function MetricCard({
  description,
  icon: MetricIcon,
  label,
  value,
}: {
  description: string;
  icon: LucideIcon;
  label: string;
  value: string;
}) {
  return (
    <Card className="gap-4 py-5">
      <CardHeader className="grid grid-cols-[1fr_auto] px-5">
        <CardDescription>{label}</CardDescription>

        <span className="flex size-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <MetricIcon aria-hidden className="size-4" />
        </span>
      </CardHeader>

      <CardContent className="space-y-1 px-5">
        <p className="text-2xl font-semibold tabular-nums">{value}</p>

        <p className="text-xs leading-5 text-muted-foreground">{description}</p>
      </CardContent>
    </Card>
  );
}

function GlobalControlCard({
  capPercent,
  control,
  enabled,
  formatDateTime,
  formatMoney,
  initialOperationId,
  onUpdated,
}: {
  capPercent: number;
  control: HostedAiGlobalControlDto;
  enabled: boolean;
  formatDateTime: (value: string) => string;
  formatMoney: (value: string) => string;
  initialOperationId: string;
  onUpdated: (control: HostedAiGlobalControlDto) => void;
}) {
  const t = useTranslations();
  const [operationId, setOperationId] = useState(initialOperationId);
  const { onSubmit, pending, state } = useOperatorForm(updateGlobalControlAction, (next) => {
    setOperationId(freshOperationId());
    onUpdated(next);
  });

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <SlidersHorizontal aria-hidden className="size-5 text-primary" />

          <CardTitle>{t("OperatorConsole.controls.title")}</CardTitle>
        </div>

        <CardDescription>{t("OperatorConsole.controls.description")}</CardDescription>
      </CardHeader>

      <CardContent className="space-y-5">
        <div className="rounded-lg border border-border bg-muted/30 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
            <span className="font-medium">{t("OperatorConsole.controls.monthlyCap")}</span>

            <span className="tabular-nums text-muted-foreground">
              {control.monthlySpendCapMicrocents
                ? formatMoney(control.monthlySpendCapMicrocents)
                : t("OperatorConsole.values.capNotConfigured")}
            </span>
          </div>

          {control.monthlySpendCapMicrocents ? (
            <div className="mt-3 space-y-1.5">
              <div
                aria-label={t("OperatorConsole.controls.capProgress", {
                  percent: Math.round(capPercent),
                })}
                aria-valuemax={100}
                aria-valuemin={0}
                aria-valuenow={Math.round(capPercent)}
                className="h-2 overflow-hidden rounded-full bg-muted"
                role="progressbar"
              >
                <div
                  className="h-full rounded-full bg-primary transition-[width]"
                  style={{ width: `${capPercent}%` }}
                />
              </div>
            </div>
          ) : null}

          <p className="mt-3 text-xs text-muted-foreground">
            {t("OperatorConsole.controls.lastUpdated", {
              date: formatDateTime(control.updatedAt),
              version: control.version,
            })}
          </p>
        </div>

        {!enabled ? (
          <Alert>
            <ShieldAlert aria-hidden />

            <AlertTitle>{t("OperatorConsole.controls.disabledTitle")}</AlertTitle>

            <AlertDescription>{t("OperatorConsole.controls.disabledDescription")}</AlertDescription>
          </Alert>
        ) : null}

        <form key={control.version} aria-busy={pending} className="space-y-4" method="post" onSubmit={onSubmit}>
          <input name="expectedVersion" type="hidden" value={control.version} />

          <input name="operationId" type="hidden" value={operationId} />

          <div className="flex items-start gap-3 rounded-lg border border-border p-4">
            <input
              className="mt-0.5 size-4 rounded border-input accent-primary"
              defaultChecked={control.hostedProviderWorkPaused}
              disabled={!enabled || pending}
              id="hostedProviderWorkPaused"
              name="hostedProviderWorkPaused"
              type="checkbox"
            />

            <Label className="block space-y-1" htmlFor="hostedProviderWorkPaused">
              <span className="block text-sm font-medium">{t("OperatorConsole.controls.pauseLabel")}</span>

              <span className="block text-xs leading-5 text-muted-foreground">
                {t("OperatorConsole.controls.pauseDescription")}
              </span>
            </Label>
          </div>

          <Field
            description={t("OperatorConsole.controls.capDescription")}
            id="monthlySpendCapDollars"
            label={t("OperatorConsole.controls.capLabel")}
          >
            <div className="relative">
              <span
                aria-hidden
                className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-sm text-muted-foreground"
              >
                $
              </span>

              <Input
                aria-describedby="monthlySpendCapDollars-description"
                className="pl-7 tabular-nums"
                defaultValue={microcentsAsDollarInput(control.monthlySpendCapMicrocents)}
                disabled={!enabled || pending}
                id="monthlySpendCapDollars"
                inputMode="decimal"
                min="0"
                name="monthlySpendCapDollars"
                placeholder={t("OperatorConsole.controls.capPlaceholder")}
                step="0.00000001"
                type="number"
              />
            </div>
          </Field>

          <Field
            description={t("OperatorConsole.forms.reasonDescription")}
            id="globalControlReason"
            label={t("OperatorConsole.forms.reason")}
          >
            <Textarea
              required
              aria-describedby="globalControlReason-description"
              disabled={!enabled || pending}
              id="globalControlReason"
              maxLength={500}
              minLength={8}
              name="reason"
              placeholder={t("OperatorConsole.forms.reasonPlaceholder")}
              rows={3}
            />
          </Field>

          <ActionNotice state={state} success={t("OperatorConsole.controls.success")} />

          <Button disabled={!enabled || pending} type="submit">
            {pending ? (
              <Spinner aria-label={t("OperatorConsole.states.saving")} size="sm" />
            ) : (
              <SlidersHorizontal aria-hidden />
            )}

            {pending ? t("OperatorConsole.states.saving") : t("OperatorConsole.controls.save")}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

function CandidateSearchCard({
  candidate,
  searched,
  onFound,
}: {
  candidate: HostedAiOperatorCandidateDto | null;
  searched: boolean;
  onFound: (candidate: HostedAiOperatorCandidateDto | null) => void;
}) {
  const t = useTranslations();
  const { onSubmit, pending, state } = useOperatorForm(findHostedAiCandidateAction, onFound, () => onFound(null));

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Mail aria-hidden className="size-5 text-primary" />

          <CardTitle>{t("OperatorConsole.candidate.title")}</CardTitle>
        </div>

        <CardDescription>{t("OperatorConsole.candidate.description")}</CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        <form aria-busy={pending} className="space-y-3" method="post" onSubmit={onSubmit}>
          <Field
            description={t("OperatorConsole.candidate.emailDescription")}
            id="operatorCandidateEmail"
            label={t("OperatorConsole.candidate.emailLabel")}
          >
            <div className="flex flex-col gap-2 sm:flex-row">
              <Input
                required
                aria-describedby="operatorCandidateEmail-description"
                autoCapitalize="none"
                autoComplete="off"
                disabled={pending}
                id="operatorCandidateEmail"
                maxLength={320}
                name="email"
                placeholder={t("OperatorConsole.candidate.emailPlaceholder")}
                spellCheck={false}
                type="email"
              />

              <Button className="sm:w-auto" disabled={pending} type="submit">
                {pending ? (
                  <Spinner aria-label={t("OperatorConsole.states.searching")} size="sm" />
                ) : (
                  <Search aria-hidden />
                )}

                {pending ? t("OperatorConsole.states.searching") : t("OperatorConsole.candidate.search")}
              </Button>
            </div>
          </Field>
        </form>

        {state.status === "error" ? <ActionNotice state={state} /> : null}

        {searched && !candidate && state.status === "success" ? (
          <div className="rounded-lg border border-dashed border-border p-5 text-center">
            <Search aria-hidden className="mx-auto mb-2 size-5 text-muted-foreground" />

            <p className="text-sm font-medium">{t("OperatorConsole.candidate.emptyTitle")}</p>

            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              {t("OperatorConsole.candidate.emptyDescription")}
            </p>
          </div>
        ) : null}

        {candidate ? (
          <div className="rounded-lg border border-border bg-muted/30 p-4" data-testid="operator-candidate-result">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{candidate.displayName || candidate.email}</p>

                <p className="truncate text-xs text-muted-foreground">{candidate.email}</p>
              </div>

              <Badge variant={candidate.status === "active" && candidate.authEmailVerified ? "success" : "warning"}>
                <UserCheck aria-hidden />

                {candidate.status === "active" && candidate.authEmailVerified
                  ? t("OperatorConsole.candidate.eligible")
                  : t("OperatorConsole.candidate.needsAttention")}
              </Badge>
            </div>

            <dl className="mt-4 grid gap-3 text-xs sm:grid-cols-2">
              <IdDetail label={t("OperatorConsole.candidate.userId")} value={candidate.userId} />

              <IdDetail label={t("OperatorConsole.candidate.companyId")} value={candidate.companyId} />
            </dl>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

function CompanyPanel({
  candidate,
  formatDate,
  formatMoney,
  initialAdjustmentOperationId,
  initialAllowanceOperationId,
  integer,
  onCandidateChange,
  onMutated,
}: {
  candidate: HostedAiOperatorCandidateDto;
  formatDate: (value: string) => string;
  formatMoney: (value: string) => string;
  initialAdjustmentOperationId: string;
  initialAllowanceOperationId: string;
  integer: (value: number) => string;
  onCandidateChange: (candidate: HostedAiOperatorCandidateDto) => void;
  onMutated: () => void;
}) {
  const t = useTranslations();
  const company = candidate.company;
  const creditPeriod = candidate.creditPeriod;

  return (
    <section aria-labelledby="company-heading" className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold" id="company-heading">
            {t("OperatorConsole.company.title")}
          </h2>

          <p className="mt-1 text-sm text-muted-foreground">
            {t("OperatorConsole.company.description", { email: candidate.email })}
          </p>
        </div>

        <Badge variant="outline">
          <Building2 aria-hidden />

          {idSummary(company.companyId)}
        </Badge>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MiniMetric label={t("OperatorConsole.company.plan")} value={<PlanLabel plan={company.subscription.plan} />} />

        <MiniMetric
          label={t("OperatorConsole.company.subscriptionStatus")}
          value={<SubscriptionStatusLabel status={company.subscription.status} />}
        />

        <MiniMetric
          label={t("OperatorConsole.company.activeSeats")}
          value={`${integer(company.seats.active)} / ${integer(company.seats.total)}`}
        />

        <MiniMetric
          label={t("OperatorConsole.company.monthlyCommitted")}
          value={formatMoney(company.currentUtcMonth.totalCommittedMicrocents)}
        />
      </div>

      {creditPeriod ? (
        <Card className="gap-4 py-5">
          <CardHeader className="px-5">
            <CardTitle>{t("OperatorConsole.credits.title")}</CardTitle>

            <CardDescription>
              {t("OperatorConsole.credits.period", {
                start: formatDate(creditPeriod.periodStart),
                end: formatDate(creditPeriod.periodEnd),
              })}
            </CardDescription>
          </CardHeader>

          <CardContent className="grid gap-4 px-5 sm:grid-cols-2 lg:grid-cols-5">
            <MiniMetric label={t("OperatorConsole.credits.base")} value={integer(creditPeriod.baseAllowanceCredits)} />

            <MiniMetric
              label={t("OperatorConsole.credits.adjustments")}
              value={integer(creditPeriod.adjustmentCredits)}
            />

            <MiniMetric
              label={t("OperatorConsole.credits.effective")}
              value={integer(creditPeriod.effectiveAllowanceCredits)}
            />

            <MiniMetric
              label={t("OperatorConsole.credits.used")}
              value={integer(creditPeriod.chargedCredits + creditPeriod.reservedCredits)}
            />

            <MiniMetric label={t("OperatorConsole.credits.remaining")} value={integer(creditPeriod.remainingCredits)} />
          </CardContent>

          {creditPeriod.blockedReason ? (
            <CardFooter className="border-t text-sm text-warning">{t("OperatorConsole.credits.blocked")}</CardFooter>
          ) : null}
        </Card>
      ) : (
        <Alert>
          <AlertCircle aria-hidden />

          <AlertTitle>{t("OperatorConsole.credits.unavailableTitle")}</AlertTitle>

          <AlertDescription>{t("OperatorConsole.credits.unavailableDescription")}</AlertDescription>
        </Alert>
      )}

      <div className="grid items-start gap-6 lg:grid-cols-2">
        <EnterpriseAllowanceForm
          candidate={candidate}
          initialOperationId={initialAllowanceOperationId}
          onCandidateRefreshed={(next) => {
            onCandidateChange(next);
            onMutated();
          }}
        />

        <CreditAdjustmentForm
          candidate={candidate}
          formatDate={formatDate}
          initialOperationId={initialAdjustmentOperationId}
          onCandidateRefreshed={(next) => {
            onCandidateChange(next);
            onMutated();
          }}
        />
      </div>
    </section>
  );
}

function EnterpriseAllowanceForm({
  candidate,
  initialOperationId,
  onCandidateRefreshed,
}: {
  candidate: HostedAiOperatorCandidateDto;
  initialOperationId: string;
  onCandidateRefreshed: (candidate: HostedAiOperatorCandidateDto) => void;
}) {
  const t = useTranslations();
  const [operationId, setOperationId] = useState(initialOperationId);
  const enterprise = candidate.company.subscription.plan === "enterprise";
  const { onSubmit, pending, state } = useOperatorForm(
    updateEnterpriseAllowanceAction,
    ({ candidate: refreshedCandidate }) => {
      setOperationId(freshOperationId());
      onCandidateRefreshed(refreshedCandidate);
    },
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("OperatorConsole.allowance.title")}</CardTitle>

        <CardDescription>{t("OperatorConsole.allowance.description")}</CardDescription>
      </CardHeader>

      <CardContent>
        {!enterprise ? (
          <Alert className="mb-4">
            <AlertCircle aria-hidden />

            <AlertTitle>{t("OperatorConsole.allowance.enterpriseOnlyTitle")}</AlertTitle>

            <AlertDescription>{t("OperatorConsole.allowance.enterpriseOnlyDescription")}</AlertDescription>
          </Alert>
        ) : null}

        <form aria-busy={pending} className="space-y-4" method="post" onSubmit={onSubmit}>
          <input name="companyId" type="hidden" value={candidate.companyId} />

          <input name="candidateEmail" type="hidden" value={candidate.email} />

          <input name="operationId" type="hidden" value={operationId} />

          <Field
            description={t("OperatorConsole.allowance.creditsDescription")}
            id="enterpriseCreditsPerUser"
            label={t("OperatorConsole.allowance.creditsLabel")}
          >
            <Input
              required
              aria-describedby="enterpriseCreditsPerUser-description"
              defaultValue={candidate.company.subscription.enterpriseCreditsPerUser ?? ""}
              disabled={!enterprise || pending}
              id="enterpriseCreditsPerUser"
              inputMode="numeric"
              max={1_000_000}
              min={1}
              name="creditsPerUser"
              step={1}
              type="number"
            />
          </Field>

          <Field
            description={t("OperatorConsole.forms.reasonDescription")}
            id="allowanceReason"
            label={t("OperatorConsole.forms.reason")}
          >
            <Textarea
              required
              aria-describedby="allowanceReason-description"
              disabled={!enterprise || pending}
              id="allowanceReason"
              maxLength={500}
              minLength={8}
              name="reason"
              placeholder={t("OperatorConsole.forms.reasonPlaceholder")}
              rows={3}
            />
          </Field>

          <ActionNotice state={state} success={t("OperatorConsole.allowance.success")} />

          <Button disabled={!enterprise || pending} type="submit">
            {pending ? <Spinner aria-label={t("OperatorConsole.states.saving")} size="sm" /> : <Sparkles aria-hidden />}

            {pending ? t("OperatorConsole.states.saving") : t("OperatorConsole.allowance.save")}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

function CreditAdjustmentForm({
  candidate,
  formatDate,
  initialOperationId,
  onCandidateRefreshed,
}: {
  candidate: HostedAiOperatorCandidateDto;
  formatDate: (value: string) => string;
  initialOperationId: string;
  onCandidateRefreshed: (candidate: HostedAiOperatorCandidateDto) => void;
}) {
  const t = useTranslations();
  const [operationId, setOperationId] = useState(initialOperationId);
  const period = candidate.creditPeriod;
  const { onSubmit, pending, state } = useOperatorForm(createCreditAdjustmentAction, ({ candidate: refreshed }) => {
    setOperationId(freshOperationId());
    onCandidateRefreshed(refreshed);
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("OperatorConsole.adjustment.title")}</CardTitle>

        <CardDescription>{t("OperatorConsole.adjustment.description")}</CardDescription>
      </CardHeader>

      <CardContent>
        <form aria-busy={pending} className="space-y-4" method="post" onSubmit={onSubmit}>
          <input name="companyId" type="hidden" value={candidate.companyId} />

          <input name="userId" type="hidden" value={candidate.userId} />

          <input name="candidateEmail" type="hidden" value={candidate.email} />

          <input name="operationId" type="hidden" value={operationId} />

          <input name="periodStart" type="hidden" value={period?.periodStart ?? ""} />

          <input name="periodEnd" type="hidden" value={period?.periodEnd ?? ""} />

          <div className="rounded-lg border border-border bg-muted/30 p-3 text-xs text-muted-foreground">
            {period
              ? t("OperatorConsole.adjustment.period", {
                  start: formatDate(period.periodStart),
                  end: formatDate(period.periodEnd),
                })
              : t("OperatorConsole.adjustment.periodUnavailable")}
          </div>

          <Field
            description={t("OperatorConsole.adjustment.deltaDescription")}
            id="creditDelta"
            label={t("OperatorConsole.adjustment.deltaLabel")}
          >
            <Input
              required
              aria-describedby="creditDelta-description"
              disabled={!period || pending}
              id="creditDelta"
              inputMode="numeric"
              max={1_000_000}
              min={-1_000_000}
              name="creditDelta"
              placeholder={t("OperatorConsole.adjustment.deltaPlaceholder")}
              step={1}
              type="number"
            />
          </Field>

          <Field
            description={t("OperatorConsole.forms.reasonDescription")}
            id="adjustmentReason"
            label={t("OperatorConsole.forms.reason")}
          >
            <Textarea
              required
              aria-describedby="adjustmentReason-description"
              disabled={!period || pending}
              id="adjustmentReason"
              maxLength={500}
              minLength={8}
              name="reason"
              placeholder={t("OperatorConsole.forms.reasonPlaceholder")}
              rows={3}
            />
          </Field>

          <ActionNotice state={state} success={t("OperatorConsole.adjustment.success")} />

          <Button disabled={!period || pending} type="submit">
            {pending ? (
              <Spinner aria-label={t("OperatorConsole.states.saving")} size="sm" />
            ) : (
              <CircleDollarSign aria-hidden />
            )}

            {pending ? t("OperatorConsole.states.saving") : t("OperatorConsole.adjustment.save")}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

function AuditReport({
  initialPage,
  formatDateTime,
}: {
  initialPage: OperatorAuditPageDto;
  formatDateTime: (value: string) => string;
}) {
  const t = useTranslations();
  const [events, setEvents] = useState(initialPage.events);
  const [nextCursor, setNextCursor] = useState(initialPage.nextCursor);
  const { onSubmit, pending, state } = useOperatorForm(loadOperatorAuditEventsAction, (page) => {
    setEvents((current) => {
      const seen = new Set(current.map((event) => event.id));
      return [...current, ...page.events.filter((event) => !seen.has(event.id))];
    });
    setNextCursor(page.nextCursor);
  });

  useEffect(() => {
    setEvents(initialPage.events);
    setNextCursor(initialPage.nextCursor);
  }, [initialPage]);

  return (
    <section aria-labelledby="audit-heading">
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <History aria-hidden className="size-5 text-primary" />

            <CardTitle id="audit-heading">{t("OperatorConsole.audit.title")}</CardTitle>
          </div>

          <CardDescription>{t("OperatorConsole.audit.description")}</CardDescription>
        </CardHeader>

        <CardContent className="px-0 sm:px-6">
          {events.length === 0 ? (
            <div className="px-6 py-10 text-center sm:px-0">
              <History aria-hidden className="mx-auto mb-2 size-5 text-muted-foreground" />

              <p className="text-sm font-medium">{t("OperatorConsole.audit.emptyTitle")}</p>

              <p className="mt-1 text-xs text-muted-foreground">{t("OperatorConsole.audit.emptyDescription")}</p>
            </div>
          ) : (
            <Table>
              <TableCaption>{t("OperatorConsole.audit.caption")}</TableCaption>

              <TableHeader>
                <TableRow>
                  <TableHead>{t("OperatorConsole.audit.columns.time")}</TableHead>

                  <TableHead>{t("OperatorConsole.audit.columns.action")}</TableHead>

                  <TableHead>{t("OperatorConsole.audit.columns.actor")}</TableHead>

                  <TableHead>{t("OperatorConsole.audit.columns.target")}</TableHead>

                  <TableHead>{t("OperatorConsole.audit.columns.reason")}</TableHead>

                  <TableHead>{t("OperatorConsole.audit.columns.operation")}</TableHead>
                </TableRow>
              </TableHeader>

              <TableBody>
                {events.map((event) => (
                  <TableRow key={event.id}>
                    <TableCell className="text-muted-foreground">{formatDateTime(event.createdAt)}</TableCell>

                    <TableCell>
                      <Badge variant="secondary">
                        <AuditActionLabel action={event.action} />
                      </Badge>
                    </TableCell>

                    <TableCell>
                      <IdCode value={event.actorUserId} />
                    </TableCell>

                    <TableCell>
                      {event.targetUserId ? (
                        <IdCode value={event.targetUserId} />
                      ) : event.targetCompanyId ? (
                        <IdCode value={event.targetCompanyId} />
                      ) : (
                        "—"
                      )}
                    </TableCell>

                    <TableCell className="max-w-72 whitespace-normal text-muted-foreground">
                      {event.reason || "—"}
                    </TableCell>

                    <TableCell>
                      <IdCode value={event.operationId} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}

          {state.status === "error" ? (
            <div className="px-6 pt-4 sm:px-0">
              <ActionNotice state={state} />
            </div>
          ) : null}
        </CardContent>

        {nextCursor ? (
          <CardFooter className="border-t pt-6">
            <form aria-busy={pending} method="post" onSubmit={onSubmit}>
              <input name="cursor" type="hidden" value={nextCursor} />

              <Button disabled={pending} type="submit" variant="secondary">
                {pending ? (
                  <Spinner aria-label={t("OperatorConsole.states.loading")} size="sm" />
                ) : (
                  <History aria-hidden />
                )}

                {pending ? t("OperatorConsole.states.loading") : t("OperatorConsole.audit.loadMore")}
              </Button>
            </form>
          </CardFooter>
        ) : null}
      </Card>
    </section>
  );
}

function AuditActionLabel({ action }: { action: OperatorAuditEventDto["action"] }) {
  const t = useTranslations();
  if (action === "hosted_ai.overview.read") return t("OperatorConsole.audit.actions.overviewRead");
  if (action === "hosted_ai.candidate.read") return t("OperatorConsole.audit.actions.candidateRead");
  if (action === "hosted_ai.company.read") return t("OperatorConsole.audit.actions.companyRead");
  if (action === "hosted_ai.audit.read") return t("OperatorConsole.audit.actions.auditRead");
  if (action === "hosted_ai.global_control.update") return t("OperatorConsole.audit.actions.globalControlUpdate");
  if (action === "hosted_ai.enterprise_allowance.update") return t("OperatorConsole.audit.actions.allowanceUpdate");
  if (action === "hosted_ai.credit_adjustment.create") return t("OperatorConsole.audit.actions.adjustmentCreate");
  if (action === "operator.users.list") return t("OperatorConsole.audit.actions.userListRead");
  if (action === "operator.users.summary") return t("OperatorConsole.audit.actions.userSummaryRead");
  if (action === "operator.users.detail") return t("OperatorConsole.audit.actions.userDetailRead");
  if (action === "operator.user_status.update") return t("OperatorConsole.audit.actions.userStatusUpdate");
  if (action === "operator.subscription_snapshot.correct")
    return t("OperatorConsole.audit.actions.subscriptionSnapshotCorrect");
  if (action === "operator.credit_balance.reset") return t("OperatorConsole.audit.actions.creditBalanceReset");
  if (action === "operator.bootstrap") return t("OperatorConsole.audit.actions.bootstrap");
  return t("OperatorConsole.audit.actions.other");
}

function PlanLabel({ plan }: { plan: HostedAiOperatorCompanyDto["subscription"]["plan"] }) {
  const t = useTranslations();
  if (plan === "starter") return t("OperatorConsole.values.plans.starter");
  if (plan === "pro") return t("OperatorConsole.values.plans.pro");
  if (plan === "business") return t("OperatorConsole.values.plans.business");
  return t("OperatorConsole.values.plans.enterprise");
}

function SubscriptionStatusLabel({ status }: { status: HostedAiOperatorCompanyDto["subscription"]["status"] }) {
  const t = useTranslations();
  if (status === "trial") return t("OperatorConsole.values.subscription.trial");
  if (status === "active") return t("OperatorConsole.values.subscription.active");
  if (status === "cancelled") return t("OperatorConsole.values.subscription.cancelled");
  if (status === "expired") return t("OperatorConsole.values.subscription.expired");
  if (status === "pastDue") return t("OperatorConsole.values.subscription.pastDue");
  return t("OperatorConsole.values.subscription.unPaid");
}

function MiniMetric({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <p className="text-xs text-muted-foreground">{label}</p>

      <p className="mt-1 text-sm font-semibold tabular-nums">{value}</p>
    </div>
  );
}

function IdDetail({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-muted-foreground">{label}</dt>

      <dd className="mt-1">
        <IdCode value={value} />
      </dd>
    </div>
  );
}

function IdCode({ value }: { value: string }) {
  return (
    <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-[11px]" title={value}>
      {idSummary(value)}
    </code>
  );
}

function Field({
  children,
  description,
  id,
  label,
}: {
  children: React.ReactNode;
  description?: string;
  id: string;
  label: string;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>

      {children}

      {description ? (
        <p className="text-xs leading-5 text-muted-foreground" id={`${id}-description`}>
          {description}
        </p>
      ) : null}
    </div>
  );
}

function ActionNotice<T>({ state, success }: { state: OperatorActionState<T>; success?: string }) {
  const t = useTranslations();
  if (state.status === "idle") return null;
  if (state.status === "success") {
    if (!success) return null;
    return (
      <Alert className="border-success/30" role="status">
        <CheckCircle2 aria-hidden className="text-success" />

        <AlertTitle>{success}</AlertTitle>
      </Alert>
    );
  }

  return (
    <Alert variant="destructive">
      <AlertCircle aria-hidden />

      <AlertTitle>{t("OperatorConsole.errors.title")}</AlertTitle>

      <AlertDescription>
        <OperatorErrorMessage code={state.errorCode} />
      </AlertDescription>
    </Alert>
  );
}

function OperatorErrorMessage({ code }: { code: OperatorActionErrorCode }) {
  const t = useTranslations();
  if (code === "accessDenied") return t("OperatorConsole.errors.accessDenied");
  if (code === "conflict") return t("OperatorConsole.errors.conflict");
  if (code === "invalidInput") return t("OperatorConsole.errors.invalidInput");
  if (code === "notFound") return t("OperatorConsole.errors.notFound");
  if (code === "unavailable") return t("OperatorConsole.errors.unavailable");
  return t("OperatorConsole.errors.unexpected");
}
