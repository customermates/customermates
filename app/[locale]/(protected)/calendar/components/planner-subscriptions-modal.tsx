"use client";

import type { PlannerConfig, PlannerQuery } from "@/features/planner/planner.schema";
import type { SubscriptionList } from "@/features/planner/calendar-subscription.schema";
import type { TypedActionResult } from "@/core/utils/action-result";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Copy, Download, Link, Trash2 } from "lucide-react";
import { AppModal, AppModalTitle } from "@/components/modal/app-modal";
import { AppCard } from "@/components/card/app-card";
import { AppCardHeader } from "@/components/card/app-card-header";
import { AppCardBody } from "@/components/card/app-card-body";
import { useRecordValueFormat } from "@/components/records/record-value";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { SectionRows } from "@/components/ui/section-rows";
import { IconButton } from "@/components/ui/icon-button";
import { Skeleton } from "@/components/ui/skeleton";
import { actionData } from "@/core/utils/action-data";
import { runUserAction, reportApplicationError } from "@/core/errors/report-application-error";
import { notifyIfWorkspaceChanged } from "@/core/errors/workspace-changed-notice";
import { toastZodErrorTree } from "@/core/utils/toast-zod-error-tree";
import { serializedFailureErrorTree } from "@/core/validation/validation.utils";
import { CALENDAR_SUBSCRIPTION_LIMIT } from "@/features/planner/calendar-subscription.schema";
import { calendarSubscriptionsAction, exportPlannerAction } from "../actions";

function refused<T>(result: TypedActionResult<T>): result is Extract<TypedActionResult<T>, { ok: false }> {
  if (result.ok) return false;
  if (!notifyIfWorkspaceChanged(result.failure)) toastZodErrorTree(serializedFailureErrorTree(result.failure));
  return true;
}

export function PlannerSubscriptionsModal({
  config,
  window,
  personalAvailable,
  truncated,
  onClose,
}: {
  config: PlannerConfig;
  window: PlannerQuery["window"];
  personalAvailable: boolean;
  truncated: boolean;
  onClose: () => void;
}) {
  const t = useTranslations();
  const format = useRecordValueFormat();
  const [includePersonalEvents, setIncludePersonalEvents] = useState(false);
  const [state, setState] = useState<SubscriptionList | null>(null);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    setFailed(false);
    actionData(calendarSubscriptionsAction({ action: "list" }))
      .then((value) => {
        if (active) setState(value);
      })
      .catch((error: unknown) => {
        if (active) {
          setFailed(true);
          reportApplicationError(error);
        }
      });
    return () => {
      active = false;
    };
  }, [attempt]);
  async function perform(action: () => Promise<void>) {
    setBusy(true);
    try {
      await action();
    } finally {
      setBusy(false);
    }
  }
  async function download() {
    const result = await exportPlannerAction({ config, window, includePersonalEvents });
    if (refused(result)) return;
    const url = URL.createObjectURL(new Blob([result.data], { type: "text/calendar;charset=utf-8" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "customermates.ics";
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  async function manage(input: Parameters<typeof calendarSubscriptionsAction>[0]) {
    const result = await calendarSubscriptionsAction(input);
    if (!refused(result)) setState(result.data);
  }
  return (
    <AppModal open titleInContent size="xl" title={t("Planner.calendarSync")} onClose={onClose}>
      <AppCard>
        <AppCardHeader>
          <AppModalTitle className="min-w-0 break-words text-base font-semibold">
            {t("Planner.calendarSync")}
          </AppModalTitle>
        </AppCardHeader>

        <AppCardBody>
          <p className="text-sm text-muted-foreground">{t("Planner.syncDescription")}</p>

          {truncated && (
            <p className="rounded-md bg-warning/10 px-3 py-2 text-xs text-warning" role="status">
              {t("Planner.truncated")}
            </p>
          )}

          {personalAvailable && (
            <div className="flex items-start gap-2">
              <Checkbox
                checked={includePersonalEvents}
                id="planner-export-personal"
                onCheckedChange={(checked) => setIncludePersonalEvents(checked === true)}
              />

              <Label className="leading-snug" htmlFor="planner-export-personal">
                {t("Planner.includePersonal")}
              </Label>
            </div>
          )}

          <section className="space-y-2">
            <h3 className="text-sm font-medium">{t("Planner.snapshot")}</h3>

            <p className="text-sm text-muted-foreground">{t("Planner.snapshotDescription")}</p>

            <Button
              disabled={busy || truncated}
              variant="secondary"
              onClick={() => runUserAction(() => perform(download))}
            >
              <Download aria-hidden className="size-4" />

              {t("Planner.download")}
            </Button>
          </section>

          <section className="space-y-3">
            <h3 className="text-sm font-medium">{t("Planner.subscription")}</h3>

            <p className="text-sm text-muted-foreground">{t("Planner.subscriptionDescription")}</p>

            {state?.created && (
              <div className="space-y-2 rounded-md border p-3">
                <Label htmlFor="planner-subscription-url">{t("Planner.privateUrl")}</Label>

                <div className="flex gap-2">
                  <Input
                    readOnly
                    id="planner-subscription-url"
                    value={state.created.url}
                    onFocus={(event) => event.currentTarget.select()}
                  />

                  <IconButton
                    icon={Copy}
                    label={t("Planner.copyLink")}
                    onClick={() => runUserAction(() => navigator.clipboard.writeText(state.created?.url ?? ""))}
                  />
                </div>

                <p className="text-xs text-muted-foreground">{t("Planner.privateUrlDescription")}</p>
              </div>
            )}

            {failed ? (
              <Button variant="secondary" onClick={() => setAttempt((value) => value + 1)}>
                {t("ErrorCard.retry")}
              </Button>
            ) : !state ? (
              <Skeleton className="h-9" />
            ) : (
              <>
                <Button
                  disabled={busy || truncated || state.subscriptions.length >= CALENDAR_SUBSCRIPTION_LIMIT}
                  variant="secondary"
                  onClick={() =>
                    runUserAction(() => perform(() => manage({ action: "create", config, includePersonalEvents })))
                  }
                >
                  <Link aria-hidden className="size-4" />

                  {t("Planner.createSubscription")}
                </Button>

                <SectionRows>
                  {state.subscriptions.map((subscription) => (
                    <div key={subscription.id} className="flex items-center justify-between gap-2 py-2">
                      <span className="text-sm">
                        {t("Planner.subscriptionCreated", {
                          date: format.date(new Date(subscription.createdAt), {
                            dateStyle: "medium",
                            timeStyle: "short",
                          }),
                        })}
                      </span>

                      <Button
                        aria-label={t("Planner.revokeSubscription")}
                        disabled={busy}
                        size="icon-sm"
                        variant="ghostDestructive"
                        onClick={() =>
                          runUserAction(() => perform(() => manage({ action: "revoke", id: subscription.id })))
                        }
                      >
                        <Trash2 aria-hidden className="size-4" />
                      </Button>
                    </div>
                  ))}
                </SectionRows>
              </>
            )}
          </section>
        </AppCardBody>
      </AppCard>
    </AppModal>
  );
}
