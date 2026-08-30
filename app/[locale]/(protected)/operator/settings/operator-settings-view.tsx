"use client";

import type { FormEvent } from "react";
import type { HostedAiGlobalControlDto } from "@/ee/operator/operator.schema";

import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";

import { FormField, OperatorUsersActionNotice } from "../users/operator-users-ui";
import { ReasonTextarea } from "../workspaces/reason-textarea";
import { microcentsAsDollarInput } from "./operator-form-values";
import { updateOperatorGlobalControlAction, type OperatorSettingsActionState } from "./actions";

type Props = { control: HostedAiGlobalControlDto; controlsEnabled: boolean };

export function OperatorSettingsView({ control, controlsEnabled }: Props) {
  const t = useTranslations();
  const [current, setCurrent] = useState(control);
  const [operationId, setOperationId] = useState(() => globalThis.crypto.randomUUID());
  const [pending, startTransition] = useTransition();
  const [state, setState] = useState<OperatorSettingsActionState<HostedAiGlobalControlDto>>({ status: "idle" });

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;

    const form = event.currentTarget;
    const formData = new FormData(form);
    setState({ status: "idle" });

    startTransition(async () => {
      const next = await updateOperatorGlobalControlAction(state, formData);
      setState(next);
      if (next.status === "success") {
        setCurrent(next.data);
        setOperationId(globalThis.crypto.randomUUID());
      }
    });
  }

  return (
    <div className="max-w-2xl space-y-6">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{t("OperatorSettings.title")}</h1>

        <p className="text-sm leading-6 text-muted-foreground sm:text-base">{t("OperatorSettings.description")}</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t("OperatorSettings.controls.title")}</CardTitle>

          <CardDescription>{t("OperatorSettings.controls.description")}</CardDescription>
        </CardHeader>

        <CardContent>
          {!controlsEnabled ? (
            <Alert>
              <AlertTitle>{t("OperatorSettings.controls.disabledTitle")}</AlertTitle>

              <AlertDescription>{t("OperatorSettings.controls.disabledDescription")}</AlertDescription>
            </Alert>
          ) : (
            <form aria-busy={pending} className="space-y-4" method="post" onSubmit={onSubmit}>
              <input name="operationId" type="hidden" value={operationId} />

              <input name="expectedVersion" type="hidden" value={current.version} />

              <div className="flex items-start gap-3">
                <Checkbox
                  defaultChecked={current.hostedProviderWorkPaused}
                  disabled={pending}
                  id="hostedProviderWorkPaused"
                  name="hostedProviderWorkPaused"
                />

                <div className="space-y-1">
                  <Label htmlFor="hostedProviderWorkPaused">{t("OperatorSettings.controls.pauseLabel")}</Label>

                  <p className="text-xs text-muted-foreground">{t("OperatorSettings.controls.pauseDescription")}</p>
                </div>
              </div>

              <FormField
                description={t("OperatorSettings.controls.capDescription")}
                id="monthlySpendCapDollars"
                label={t("OperatorSettings.controls.capLabel")}
              >
                <Input
                  defaultValue={microcentsAsDollarInput(current.monthlySpendCapMicrocents)}
                  disabled={pending}
                  id="monthlySpendCapDollars"
                  inputMode="decimal"
                  min={0}
                  name="monthlySpendCapDollars"
                  step="0.00000001"
                  type="number"
                />
              </FormField>

              <ReasonTextarea disabled={pending} id="operatorGlobalControlReason" />

              <OperatorUsersActionNotice state={state} success={t("OperatorSettings.controls.success")} />

              <Button disabled={pending} type="submit">
                {pending ? <Spinner aria-label={t("OperatorUsers.states.saving")} size="sm" /> : null}

                {t("OperatorSettings.controls.save")}
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
