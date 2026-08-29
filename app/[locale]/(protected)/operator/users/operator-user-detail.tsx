"use client";

import type { FormEvent, ReactNode } from "react";
import type {
  OperatorUserCreditPeriodDto,
  OperatorUserDetailDto,
  ResetOperatorUserCreditsResultDto,
} from "@/ee/operator/operator.schema";
import type { OperatorUserCreditAdjustmentResult, OperatorUsersActionState } from "./actions";

import { AlertCircle, CircleDollarSign, CreditCard, RefreshCcw, Save, ShieldAlert, UserCog, X } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import { useEffect, useRef, useState, useTransition } from "react";

import {
  correctOperatorSubscriptionSnapshotAction,
  createOperatorUserCreditAdjustmentAction,
  getOperatorUserDetailAction,
  resetOperatorUserCreditsAction,
  updateOperatorUserStatusAction,
} from "./actions";
import { AccountStatusLabel, FormField, IdCode, NativeSelect, OperatorUsersActionNotice } from "./operator-users-ui";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";

type MutationKey = "adjustment" | "reset" | "status" | "subscription";

type OperatorServerAction<T> = (
  previous: OperatorUsersActionState<T>,
  formData: FormData,
) => Promise<OperatorUsersActionState<T>>;

function freshOperationId(): string {
  return globalThis.crypto.randomUUID();
}

function useOperatorMutation<T>(
  action: OperatorServerAction<T>,
  initialOperationId: string,
  onSuccess: (data: T) => void,
  onPendingChange: (pending: boolean) => void,
  onConflict?: () => Promise<void> | void,
) {
  const [operationId, setOperationId] = useState(initialOperationId);
  const [pending, startTransition] = useTransition();
  const [state, setState] = useState<OperatorUsersActionState<T>>({ status: "idle" });
  const latestState = useRef(state);
  latestState.current = state;

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;

    const form = event.currentTarget;
    const formData = new FormData(form);
    setState({ status: "idle" });
    onPendingChange(true);

    startTransition(async () => {
      try {
        const next = await action(latestState.current, formData);
        latestState.current = next;
        setState(next);
        if (next.status === "error" && next.errorCode === "conflict") await onConflict?.();
        if (next.status === "success") {
          setOperationId(freshOperationId());
          onSuccess(next.data);
          form.reset();
        }
      } catch {
        const next: OperatorUsersActionState<T> = {
          status: "error",
          errorCode: "unexpected",
          operationId,
        };
        latestState.current = next;
        setState(next);
      } finally {
        onPendingChange(false);
      }
    });
  }

  return { onSubmit, operationId, pending, state };
}

export function OperatorUserDetailPanel({
  user,
  onClose,
  onMutationPendingChange,
  onUpdated,
}: {
  user: OperatorUserDetailDto;
  onClose: () => void;
  onMutationPendingChange?: (pending: boolean) => void;
  onUpdated: (user: OperatorUserDetailDto) => void;
}) {
  const t = useTranslations();
  const format = useFormatter();
  const detailHeadingRef = useRef<HTMLHeadingElement>(null);
  const [activeMutation, setActiveMutation] = useState<MutationKey | null>(null);
  const [operationIds] = useState(() => ({
    adjustment: freshOperationId(),
    reset: freshOperationId(),
    status: freshOperationId(),
    subscription: freshOperationId(),
  }));
  const busy = activeMutation !== null;
  const dateTime = (value: string | null) =>
    value
      ? format.dateTime(new Date(value), {
          dateStyle: "medium",
          timeStyle: "short",
          timeZone: "UTC",
        })
      : t("OperatorUsers.values.never");
  const integer = (value: number) => format.number(value, { maximumFractionDigits: 0 });
  const onPendingChange = (mutation: MutationKey) => (pending: boolean) => {
    setActiveMutation((current) => (pending ? mutation : current === mutation ? null : current));
    onMutationPendingChange?.(pending);
  };
  const refreshAfterConflict = async () => {
    const result = await getOperatorUserDetailAction(user.userId);
    if (result.status !== "success") throw new Error("Operator detail refresh failed");
    onUpdated(result.data);
  };

  useEffect(() => detailHeadingRef.current?.focus(), [user.userId]);

  return (
    <div className="space-y-4" data-testid="operator-user-detail">
      <Card>
        <CardHeader className="grid grid-cols-[1fr_auto] gap-3">
          <div className="min-w-0">
            <CardTitle>
              <h2 ref={detailHeadingRef} className="truncate outline-none" tabIndex={-1}>
                {user.displayName || user.email}
              </h2>
            </CardTitle>

            <CardDescription className="truncate">{user.email}</CardDescription>
          </div>

          <Button
            aria-label={t("OperatorUsers.detail.close")}
            disabled={busy}
            size="icon-sm"
            variant="ghost"
            onClick={onClose}
          >
            <X aria-hidden />
          </Button>
        </CardHeader>

        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <Badge
              variant={user.status === "active" ? "success" : user.status === "inactive" ? "destructive" : "warning"}
            >
              <AccountStatusLabel status={user.status} />
            </Badge>

            {user.isPlatformOperator ? <Badge variant="info">{t("OperatorUsers.values.operator")}</Badge> : null}

            <Badge variant={user.authEmailVerified ? "success" : "warning"}>
              {user.authEmailVerified ? t("OperatorUsers.values.verified") : t("OperatorUsers.values.notVerified")}
            </Badge>
          </div>

          <dl className="grid gap-4 text-xs sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
            <DetailValue label={t("OperatorUsers.detail.userId")}>
              <IdCode value={user.userId} />
            </DetailValue>

            <DetailValue label={t("OperatorUsers.detail.companyId")}>
              <IdCode value={user.companyId} />
            </DetailValue>

            <DetailValue label={t("OperatorUsers.detail.role")}>
              {user.role ? (
                <span className="inline-flex flex-wrap items-center gap-2">
                  <span>{user.role.name}</span>

                  {user.role.isSystemRole ? (
                    <Badge variant="secondary">{t("OperatorUsers.detail.systemRole")}</Badge>
                  ) : null}
                </span>
              ) : (
                t("OperatorUsers.detail.noRole")
              )}
            </DetailValue>

            <DetailValue label={t("OperatorUsers.detail.lastActive")}>{dateTime(user.lastActiveAt)}</DetailValue>

            <DetailValue label={t("OperatorUsers.detail.createdAt")}>{dateTime(user.createdAt)}</DetailValue>

            <DetailValue label={t("OperatorUsers.detail.updatedAt")}>{dateTime(user.updatedAt)}</DetailValue>
          </dl>
        </CardContent>
      </Card>

      <UserStatusForm
        busy={busy}
        initialOperationId={operationIds.status}
        user={user}
        onConflict={refreshAfterConflict}
        onPendingChange={onPendingChange("status")}
        onUpdated={onUpdated}
      />

      <SubscriptionCorrectionForm
        busy={busy}
        initialOperationId={operationIds.subscription}
        user={user}
        onConflict={refreshAfterConflict}
        onPendingChange={onPendingChange("subscription")}
        onUpdated={onUpdated}
      />

      <CreditPosition creditPeriod={user.creditPeriod} integer={integer} />

      <Alert>
        <ShieldAlert aria-hidden />

        <AlertTitle>{t("OperatorUsers.credits.immutableTitle")}</AlertTitle>

        <AlertDescription>{t("OperatorUsers.credits.immutableDescription")}</AlertDescription>
      </Alert>

      <CreditAdjustmentForm
        busy={busy}
        initialOperationId={operationIds.adjustment}
        user={user}
        onConflict={refreshAfterConflict}
        onPendingChange={onPendingChange("adjustment")}
        onUpdated={onUpdated}
      />

      <CreditResetForm
        busy={busy}
        initialOperationId={operationIds.reset}
        user={user}
        onConflict={refreshAfterConflict}
        onPendingChange={onPendingChange("reset")}
        onUpdated={onUpdated}
      />
    </div>
  );
}

function UserStatusForm({
  busy,
  initialOperationId,
  user,
  onConflict,
  onPendingChange,
  onUpdated,
}: {
  busy: boolean;
  initialOperationId: string;
  user: OperatorUserDetailDto;
  onConflict: () => Promise<void>;
  onPendingChange: (pending: boolean) => void;
  onUpdated: (user: OperatorUserDetailDto) => void;
}) {
  const t = useTranslations();
  const disabled = busy || !user.statusMutation.allowed;
  const { onSubmit, operationId, pending, state } = useOperatorMutation(
    updateOperatorUserStatusAction,
    initialOperationId,
    onUpdated,
    onPendingChange,
    onConflict,
  );

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <UserCog aria-hidden className="size-5 text-primary" />

          <CardTitle>{t("OperatorUsers.status.title")}</CardTitle>
        </div>

        <CardDescription>{t("OperatorUsers.status.description")}</CardDescription>
      </CardHeader>

      <CardContent>
        <form aria-busy={pending} className="space-y-4" method="post" onSubmit={onSubmit}>
          <input name="userId" type="hidden" value={user.userId} />

          <input name="expectedUpdatedAt" type="hidden" value={user.updatedAt} />

          <input name="operationId" type="hidden" value={operationId} />

          <Alert>
            <AlertCircle aria-hidden />

            <AlertTitle>{t("OperatorUsers.status.adminWarningTitle")}</AlertTitle>

            <AlertDescription>{t("OperatorUsers.status.adminWarningDescription")}</AlertDescription>
          </Alert>

          {user.isCurrentOperator ? (
            <Alert>
              <ShieldAlert aria-hidden />

              <AlertTitle>{t("OperatorUsers.status.currentOperatorTitle")}</AlertTitle>

              <AlertDescription>{t("OperatorUsers.status.currentOperatorDescription")}</AlertDescription>
            </Alert>
          ) : null}

          {!user.statusMutation.allowed ? (
            <Alert>
              <RefreshCcw aria-hidden />

              <AlertTitle>{t("OperatorUsers.status.providerSyncRequiredTitle")}</AlertTitle>

              <AlertDescription>{t("OperatorUsers.status.providerSyncRequiredDescription")}</AlertDescription>
            </Alert>
          ) : null}

          <FormField id="operatorUserStatus" label={t("OperatorUsers.status.label")}>
            <NativeSelect
              key={user.status}
              required
              defaultValue={user.status}
              disabled={disabled}
              id="operatorUserStatus"
              name="status"
            >
              <option value="active">{t("OperatorUsers.values.accountStatus.active")}</option>

              <option value="inactive">{t("OperatorUsers.values.accountStatus.inactive")}</option>

              <option value="pendingAuthorization">
                {t("OperatorUsers.values.accountStatus.pendingAuthorization")}
              </option>
            </NativeSelect>
          </FormField>

          <ReasonField disabled={disabled} id="operatorUserStatusReason" />

          <OperatorUsersActionNotice state={state} success={t("OperatorUsers.status.success")} />

          <Button disabled={disabled} type="submit">
            {pending ? <Spinner aria-label={t("OperatorUsers.states.saving")} size="sm" /> : <Save aria-hidden />}

            {pending ? t("OperatorUsers.states.saving") : t("OperatorUsers.status.save")}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

function SubscriptionCorrectionForm({
  busy,
  initialOperationId,
  user,
  onConflict,
  onPendingChange,
  onUpdated,
}: {
  busy: boolean;
  initialOperationId: string;
  user: OperatorUserDetailDto;
  onConflict: () => Promise<void>;
  onPendingChange: (pending: boolean) => void;
  onUpdated: (user: OperatorUserDetailDto) => void;
}) {
  const t = useTranslations();
  const subscription = user.subscription;
  const disabled = busy || !subscription;
  const { onSubmit, operationId, pending, state } = useOperatorMutation(
    correctOperatorSubscriptionSnapshotAction,
    initialOperationId,
    onUpdated,
    onPendingChange,
    onConflict,
  );

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <CreditCard aria-hidden className="size-5 text-primary" />

          <CardTitle>{t("OperatorUsers.subscription.title")}</CardTitle>
        </div>

        <CardDescription>{t("OperatorUsers.subscription.description")}</CardDescription>
      </CardHeader>

      <CardContent>
        {!subscription ? (
          <Alert className="mb-4">
            <AlertCircle aria-hidden />

            <AlertTitle>{t("OperatorUsers.subscription.missingTitle")}</AlertTitle>

            <AlertDescription>{t("OperatorUsers.subscription.missingDescription")}</AlertDescription>
          </Alert>
        ) : null}

        <Alert className="mb-4">
          <ShieldAlert aria-hidden />

          <AlertTitle>{t("OperatorUsers.subscription.localOnlyTitle")}</AlertTitle>

          <AlertDescription>{t("OperatorUsers.subscription.localOnlyDescription")}</AlertDescription>
        </Alert>

        {subscription?.billingProviderManaged ? (
          <Alert className="mb-4 border-warning/30">
            <RefreshCcw aria-hidden className="text-warning" />

            <AlertTitle>{t("OperatorUsers.subscription.providerManagedTitle")}</AlertTitle>

            <AlertDescription>{t("OperatorUsers.subscription.providerManagedDescription")}</AlertDescription>
          </Alert>
        ) : null}

        <form aria-busy={pending} className="space-y-4" method="post" onSubmit={onSubmit}>
          <input name="userId" type="hidden" value={user.userId} />

          <input name="expectedUpdatedAt" type="hidden" value={subscription?.updatedAt ?? ""} />

          <input name="operationId" type="hidden" value={operationId} />

          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
            <FormField id="operatorSubscriptionPlan" label={t("OperatorUsers.subscription.planLabel")}>
              <NativeSelect
                key={subscription?.plan ?? "missing-plan"}
                required
                defaultValue={subscription?.plan ?? "starter"}
                disabled={disabled}
                id="operatorSubscriptionPlan"
                name="plan"
              >
                <option value="starter">{t("OperatorConsole.values.plans.starter")}</option>

                <option value="pro">{t("OperatorConsole.values.plans.pro")}</option>

                <option value="business">{t("OperatorConsole.values.plans.business")}</option>

                <option value="enterprise">{t("OperatorConsole.values.plans.enterprise")}</option>
              </NativeSelect>
            </FormField>

            <FormField id="operatorSubscriptionStatus" label={t("OperatorUsers.subscription.statusLabel")}>
              <NativeSelect
                key={subscription?.status ?? "missing-status"}
                required
                defaultValue={subscription?.status ?? "trial"}
                disabled={disabled}
                id="operatorSubscriptionStatus"
                name="status"
              >
                <option value="trial">{t("OperatorConsole.values.subscription.trial")}</option>

                <option value="active">{t("OperatorConsole.values.subscription.active")}</option>

                <option value="cancelled">{t("OperatorConsole.values.subscription.cancelled")}</option>

                <option value="expired">{t("OperatorConsole.values.subscription.expired")}</option>

                <option value="pastDue">{t("OperatorConsole.values.subscription.pastDue")}</option>

                <option value="unPaid">{t("OperatorConsole.values.subscription.unPaid")}</option>
              </NativeSelect>
            </FormField>
          </div>

          <FormField
            description={t("OperatorUsers.subscription.quantityDescription")}
            id="operatorSubscriptionQuantity"
            label={t("OperatorUsers.subscription.quantityLabel")}
          >
            <Input
              key={subscription?.quantity ?? "missing-quantity"}
              aria-describedby="operatorSubscriptionQuantity-description"
              defaultValue={subscription?.quantity ?? ""}
              disabled={disabled}
              id="operatorSubscriptionQuantity"
              inputMode="numeric"
              max={1_000_000}
              min={1}
              name="quantity"
              step={1}
              type="number"
            />
          </FormField>

          <ReasonField disabled={disabled} id="operatorSubscriptionReason" />

          <OperatorUsersActionNotice state={state} success={t("OperatorUsers.subscription.success")} />

          <Button disabled={disabled} type="submit">
            {pending ? <Spinner aria-label={t("OperatorUsers.states.saving")} size="sm" /> : <Save aria-hidden />}

            {pending ? t("OperatorUsers.states.saving") : t("OperatorUsers.subscription.save")}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

function CreditPosition({
  creditPeriod,
  integer,
}: {
  creditPeriod: OperatorUserCreditPeriodDto | null;
  integer: (value: number) => string;
}) {
  const t = useTranslations();
  const format = useFormatter();

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <CircleDollarSign aria-hidden className="size-5 text-primary" />

          <CardTitle>{t("OperatorUsers.credits.title")}</CardTitle>
        </div>

        <CardDescription>
          {creditPeriod
            ? t("OperatorUsers.credits.period", {
                start: format.dateTime(new Date(creditPeriod.periodStart), { dateStyle: "medium", timeZone: "UTC" }),
                end: format.dateTime(new Date(creditPeriod.periodEnd), { dateStyle: "medium", timeZone: "UTC" }),
              })
            : t("OperatorUsers.credits.periodUnavailable")}
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        {creditPeriod ? (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
            <CreditValue label={t("OperatorUsers.credits.base")} value={integer(creditPeriod.baseAllowanceCredits)} />

            <CreditValue
              label={t("OperatorUsers.credits.adjustments")}
              value={integer(creditPeriod.adjustmentCredits)}
            />

            <CreditValue
              label={t("OperatorUsers.credits.effective")}
              value={integer(creditPeriod.effectiveAllowanceCredits)}
            />

            <CreditValue label={t("OperatorUsers.credits.charged")} value={integer(creditPeriod.chargedCredits)} />

            <CreditValue label={t("OperatorUsers.credits.reserved")} value={integer(creditPeriod.reservedCredits)} />

            <CreditValue label={t("OperatorUsers.credits.committed")} value={integer(creditPeriod.committedCredits)} />

            <CreditValue label={t("OperatorUsers.credits.remaining")} value={integer(creditPeriod.remainingCredits)} />

            <CreditValue label={t("OperatorUsers.credits.overage")} value={integer(creditPeriod.overageCredits)} />
          </div>
        ) : (
          <Alert>
            <AlertCircle aria-hidden />

            <AlertTitle>{t("OperatorUsers.credits.unavailableTitle")}</AlertTitle>

            <AlertDescription>{t("OperatorUsers.credits.unavailableDescription")}</AlertDescription>
          </Alert>
        )}

        {creditPeriod?.blockedReason ? (
          <p className="text-xs text-warning">{t("OperatorUsers.credits.blocked")}</p>
        ) : null}
      </CardContent>
    </Card>
  );
}

function CreditAdjustmentForm({
  busy,
  initialOperationId,
  user,
  onConflict,
  onPendingChange,
  onUpdated,
}: {
  busy: boolean;
  initialOperationId: string;
  user: OperatorUserDetailDto;
  onConflict: () => Promise<void>;
  onPendingChange: (pending: boolean) => void;
  onUpdated: (user: OperatorUserDetailDto) => void;
}) {
  const t = useTranslations();
  const period = user.creditPeriod;
  const disabled = busy || user.status !== "active" || !period || Boolean(period.blockedReason);
  const { onSubmit, operationId, pending, state } = useOperatorMutation<OperatorUserCreditAdjustmentResult>(
    createOperatorUserCreditAdjustmentAction,
    initialOperationId,
    ({ user: refreshed }) => onUpdated(refreshed),
    onPendingChange,
    onConflict,
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("OperatorUsers.adjustment.title")}</CardTitle>

        <CardDescription>{t("OperatorUsers.adjustment.description")}</CardDescription>
      </CardHeader>

      <CardContent>
        <form aria-busy={pending} className="space-y-4" method="post" onSubmit={onSubmit}>
          <input name="companyId" type="hidden" value={user.companyId} />

          <input name="userId" type="hidden" value={user.userId} />

          <input name="operationId" type="hidden" value={operationId} />

          <input name="periodStart" type="hidden" value={period?.periodStart ?? ""} />

          <input name="periodEnd" type="hidden" value={period?.periodEnd ?? ""} />

          <FormField
            description={t("OperatorUsers.adjustment.deltaDescription")}
            id="operatorCreditDelta"
            label={t("OperatorUsers.adjustment.deltaLabel")}
          >
            <Input
              required
              aria-describedby="operatorCreditDelta-description"
              disabled={disabled}
              id="operatorCreditDelta"
              inputMode="numeric"
              max={1_000_000}
              min={-1_000_000}
              name="creditDelta"
              placeholder={t("OperatorUsers.adjustment.deltaPlaceholder")}
              step={1}
              type="number"
            />
          </FormField>

          <ReasonField disabled={disabled} id="operatorCreditAdjustmentReason" />

          <OperatorUsersActionNotice state={state} success={t("OperatorUsers.adjustment.success")} />

          <Button disabled={disabled} type="submit">
            {pending ? (
              <Spinner aria-label={t("OperatorUsers.states.saving")} size="sm" />
            ) : (
              <CircleDollarSign aria-hidden />
            )}

            {pending ? t("OperatorUsers.states.saving") : t("OperatorUsers.adjustment.save")}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

function CreditResetForm({
  busy,
  initialOperationId,
  user,
  onConflict,
  onPendingChange,
  onUpdated,
}: {
  busy: boolean;
  initialOperationId: string;
  user: OperatorUserDetailDto;
  onConflict: () => Promise<void>;
  onPendingChange: (pending: boolean) => void;
  onUpdated: (user: OperatorUserDetailDto) => void;
}) {
  const t = useTranslations();
  const disabled = busy || user.status !== "active" || !user.creditPeriod;
  const { onSubmit, operationId, pending, state } = useOperatorMutation<ResetOperatorUserCreditsResultDto>(
    resetOperatorUserCreditsAction,
    initialOperationId,
    ({ user: refreshed }) => onUpdated(refreshed),
    onPendingChange,
    onConflict,
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("OperatorUsers.reset.title")}</CardTitle>

        <CardDescription>{t("OperatorUsers.reset.description")}</CardDescription>
      </CardHeader>

      <CardContent>
        <form aria-busy={pending} className="space-y-4" method="post" onSubmit={onSubmit}>
          <input name="userId" type="hidden" value={user.userId} />

          <input name="operationId" type="hidden" value={operationId} />

          <input name="expectedPeriodStart" type="hidden" value={user.creditPeriod?.periodStart ?? ""} />

          <input name="expectedPeriodEnd" type="hidden" value={user.creditPeriod?.periodEnd ?? ""} />

          <input
            name="expectedBaseAllowanceCredits"
            type="hidden"
            value={user.creditPeriod?.baseAllowanceCredits ?? ""}
          />

          <input name="expectedAdjustmentCredits" type="hidden" value={user.creditPeriod?.adjustmentCredits ?? ""} />

          <input name="expectedCommittedCredits" type="hidden" value={user.creditPeriod?.committedCredits ?? ""} />

          <FormField
            description={t("OperatorUsers.reset.modeDescription")}
            id="operatorCreditResetMode"
            label={t("OperatorUsers.reset.modeLabel")}
          >
            <NativeSelect
              required
              aria-describedby="operatorCreditResetMode-description"
              defaultValue="baseAllowance"
              disabled={disabled}
              id="operatorCreditResetMode"
              name="mode"
            >
              <option value="baseAllowance">{t("OperatorUsers.reset.baseAllowance")}</option>

              <option value="zeroBalance">{t("OperatorUsers.reset.zeroBalance")}</option>
            </NativeSelect>
          </FormField>

          <Alert>
            <ShieldAlert aria-hidden />

            <AlertTitle>{t("OperatorUsers.reset.disclosureTitle")}</AlertTitle>

            <AlertDescription>{t("OperatorUsers.reset.disclosureDescription")}</AlertDescription>
          </Alert>

          <ReasonField disabled={disabled} id="operatorCreditResetReason" />

          <OperatorUsersActionNotice state={state} success={t("OperatorUsers.reset.success")} />

          <Button disabled={disabled} type="submit" variant="destructiveOutline">
            {pending ? <Spinner aria-label={t("OperatorUsers.states.saving")} size="sm" /> : <RefreshCcw aria-hidden />}

            {pending ? t("OperatorUsers.states.saving") : t("OperatorUsers.reset.save")}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

function ReasonField({ disabled, id }: { disabled: boolean; id: string }) {
  const t = useTranslations();
  return (
    <FormField description={t("OperatorUsers.forms.reasonDescription")} id={id} label={t("OperatorUsers.forms.reason")}>
      <Textarea
        required
        aria-describedby={`${id}-description`}
        disabled={disabled}
        id={id}
        maxLength={500}
        minLength={8}
        name="reason"
        placeholder={t("OperatorUsers.forms.reasonPlaceholder")}
        rows={3}
      />
    </FormField>
  );
}

function DetailValue({ children, label }: { children: ReactNode; label: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-muted-foreground">{label}</dt>

      <dd className="mt-1 break-words font-medium">{children}</dd>
    </div>
  );
}

function CreditValue({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-muted/30 p-3">
      <p className="text-xs text-muted-foreground">{label}</p>

      <p className="mt-1 font-semibold tabular-nums">{value}</p>
    </div>
  );
}
