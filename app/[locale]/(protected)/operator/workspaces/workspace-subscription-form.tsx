"use client";

import type { FormEvent } from "react";
import type { OperatorUserDetailDto } from "@/ee/operator/operator.schema";
import type { OperatorUsersActionState } from "../users/actions";

import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";

import { AppCard } from "@/components/card/app-card";
import { AppCardBody } from "@/components/card/app-card-body";
import { AppCardHeader } from "@/components/card/app-card-header";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";

import { correctOperatorSubscriptionSnapshotAction } from "../users/actions";
import { FormField, NativeSelect, OperatorUsersActionNotice } from "../users/operator-users-ui";
import { ReasonTextarea } from "./reason-textarea";

type Props = { owner: OperatorUserDetailDto | null; onCorrected: () => void };

export function WorkspaceSubscriptionForm({ owner, onCorrected }: Props) {
  const t = useTranslations();
  const [operationId, setOperationId] = useState(() => globalThis.crypto.randomUUID());
  const [pending, startTransition] = useTransition();
  const [state, setState] = useState<OperatorUsersActionState<OperatorUserDetailDto>>({ status: "idle" });
  const subscription = owner?.subscription ?? null;

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending || !owner) return;

    const form = event.currentTarget;
    const formData = new FormData(form);
    setState({ status: "idle" });

    startTransition(async () => {
      const next = await correctOperatorSubscriptionSnapshotAction(state, formData);
      setState(next);
      if (next.status === "success") {
        setOperationId(globalThis.crypto.randomUUID());
        onCorrected();
      }
    });
  }

  return (
    <AppCard>
      <AppCardHeader>
        <h2 className="text-x-lg grow">{t("OperatorWorkspaces.subscription.title")}</h2>
      </AppCardHeader>

      <AppCardBody>
        <Alert>
          <AlertTitle>{t("OperatorWorkspaces.subscription.warningTitle")}</AlertTitle>

          <AlertDescription>{t("OperatorWorkspaces.subscription.warningDescription")}</AlertDescription>
        </Alert>

        {!owner || !subscription ? (
          <p className="text-sm text-muted-foreground">{t("OperatorWorkspaces.subscription.unavailable")}</p>
        ) : (
          <form aria-busy={pending} className="space-y-4" method="post" onSubmit={onSubmit}>
            <input name="userId" type="hidden" value={owner.userId} />

            <input name="expectedUpdatedAt" type="hidden" value={owner.updatedAt} />

            <input name="operationId" type="hidden" value={operationId} />

            <FormField id="workspaceSubscriptionPlan" label={t("OperatorWorkspaces.columns.plan")}>
              <NativeSelect
                required
                defaultValue={subscription.plan ?? "pro"}
                disabled={pending}
                id="workspaceSubscriptionPlan"
                name="plan"
              >
                <option value="starter">{t("OperatorConsole.values.plans.starter")}</option>

                <option value="pro">{t("OperatorConsole.values.plans.pro")}</option>

                <option value="business">{t("OperatorConsole.values.plans.business")}</option>

                <option value="enterprise">{t("OperatorConsole.values.plans.enterprise")}</option>
              </NativeSelect>
            </FormField>

            <FormField id="workspaceSubscriptionStatus" label={t("OperatorWorkspaces.columns.subscription")}>
              <NativeSelect
                required
                defaultValue={subscription.status ?? "active"}
                disabled={pending}
                id="workspaceSubscriptionStatus"
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

            <FormField
              description={t("OperatorWorkspaces.subscription.seatsDescription")}
              id="workspaceSubscriptionQuantity"
              label={t("OperatorWorkspaces.subscription.seatsLabel")}
            >
              <Input
                defaultValue={subscription.quantity ?? ""}
                disabled={pending}
                id="workspaceSubscriptionQuantity"
                min={1}
                name="quantity"
                step={1}
                type="number"
              />
            </FormField>

            <ReasonTextarea disabled={pending} id="workspaceSubscriptionReason" />

            <OperatorUsersActionNotice state={state} success={t("OperatorWorkspaces.subscription.success")} />

            <Button disabled={pending} type="submit">
              {pending ? <Spinner aria-label={t("OperatorUsers.states.saving")} size="sm" /> : null}

              {t("OperatorWorkspaces.subscription.save")}
            </Button>
          </form>
        )}
      </AppCardBody>
    </AppCard>
  );
}
