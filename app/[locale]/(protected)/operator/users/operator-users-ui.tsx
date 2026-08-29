"use client";

import type { ComponentProps, ReactNode } from "react";
import type { Status, SubscriptionPlan, SubscriptionStatus } from "@/generated/prisma";
import type { OperatorUsersActionErrorCode, OperatorUsersActionState } from "./actions";

import { AlertCircle, CheckCircle2 } from "lucide-react";
import { useTranslations } from "next-intl";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Label } from "@/components/ui/label";
import { cn } from "@/core/utils/cn";

export function NativeSelect({ className, ...props }: ComponentProps<"select">) {
  return (
    <select
      className={cn(
        "flex h-9 w-full rounded-md border border-input bg-input-background px-3 py-1 text-sm shadow-xs outline-none transition-[color,box-shadow] focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-inset focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:border-border disabled:bg-background disabled:text-muted-foreground",
        className,
      )}
      {...props}
    />
  );
}

export function FormField({
  children,
  description,
  id,
  label,
}: {
  children: ReactNode;
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

export function AccountStatusLabel({ status }: { status: Status }) {
  const t = useTranslations();
  if (status === "active") return t("OperatorUsers.values.accountStatus.active");
  if (status === "inactive") return t("OperatorUsers.values.accountStatus.inactive");
  return t("OperatorUsers.values.accountStatus.pendingAuthorization");
}

export function SubscriptionPlanLabel({ plan }: { plan: SubscriptionPlan }) {
  const t = useTranslations();
  if (plan === "starter") return t("OperatorConsole.values.plans.starter");
  if (plan === "pro") return t("OperatorConsole.values.plans.pro");
  if (plan === "business") return t("OperatorConsole.values.plans.business");
  return t("OperatorConsole.values.plans.enterprise");
}

export function SubscriptionStatusLabel({ status }: { status: SubscriptionStatus }) {
  const t = useTranslations();
  if (status === "trial") return t("OperatorConsole.values.subscription.trial");
  if (status === "active") return t("OperatorConsole.values.subscription.active");
  if (status === "cancelled") return t("OperatorConsole.values.subscription.cancelled");
  if (status === "expired") return t("OperatorConsole.values.subscription.expired");
  if (status === "pastDue") return t("OperatorConsole.values.subscription.pastDue");
  return t("OperatorConsole.values.subscription.unPaid");
}

export function IdCode({ value }: { value: string }) {
  const summary = value.length <= 12 ? value : `${value.slice(0, 8)}…${value.slice(-4)}`;
  return (
    <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-[11px]" title={value}>
      {summary}
    </code>
  );
}

export function OperatorUsersActionNotice<T>({
  state,
  success,
}: {
  state: OperatorUsersActionState<T>;
  success?: string;
}) {
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

      <AlertTitle>{t("OperatorUsers.errors.title")}</AlertTitle>

      <AlertDescription>
        <OperatorUsersErrorMessage code={state.errorCode} />
      </AlertDescription>
    </Alert>
  );
}

function OperatorUsersErrorMessage({ code }: { code: OperatorUsersActionErrorCode }) {
  const t = useTranslations();
  if (code === "accessDenied") return t("OperatorUsers.errors.accessDenied");
  if (code === "conflict") return t("OperatorUsers.errors.conflict");
  if (code === "invalidInput") return t("OperatorUsers.errors.invalidInput");
  if (code === "notFound") return t("OperatorUsers.errors.notFound");
  if (code === "unavailable") return t("OperatorUsers.errors.unavailable");
  return t("OperatorUsers.errors.unexpected");
}
