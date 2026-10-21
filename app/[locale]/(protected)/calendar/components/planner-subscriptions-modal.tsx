"use client";

import type { PlannerConfig } from "@/features/planner/planner.schema";
import type { CalendarWindow } from "@/core/data-view/calendar-view-config.schema";
import type { SubscriptionList } from "@/features/planner/calendar-subscription.schema";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Copy, Download, Link, Trash2 } from "lucide-react";
import { AppModal, AppModalTitle } from "@/components/modal/app-modal";
import { AppCard } from "@/components/card/app-card";
import { AppCardHeader } from "@/components/card/app-card-header";
import { AppCardBody } from "@/components/card/app-card-body";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { SectionRows } from "@/components/ui/section-rows";
import { IconButton } from "@/components/ui/icon-button";
import { Skeleton } from "@/components/ui/skeleton";
import { actionData } from "@/core/utils/action-data";
import { runUserAction, reportApplicationError } from "@/core/errors/report-application-error";
import { calendarSubscriptionsAction, exportPlannerAction } from "../actions";

export function PlannerSubscriptionsModal({
  config,
  window,
  personalAvailable,
  onClose,
}: {
  config: PlannerConfig;
  window: CalendarWindow;
  personalAvailable: boolean;
  onClose: () => void;
}) {
  const t = useTranslations();
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
    const calendar = await actionData(exportPlannerAction({ config, window, includePersonalEvents }));
    const url = URL.createObjectURL(new Blob([calendar], { type: "text/calendar;charset=utf-8" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "customermates.ics";
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return (
    <AppModal open titleInContent size="xl" title={t("Planner.calendarSync")} onClose={onClose}>
      <AppCard>
        <AppCardHeader>
          <AppModalTitle>{t("Planner.calendarSync")}</AppModalTitle>
        </AppCardHeader>

        <AppCardBody className="space-y-5 overflow-y-auto">
          <p className="text-sm text-muted-foreground">{t("Planner.syncDescription")}</p>

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

            <Button disabled={busy} variant="secondary" onClick={() => runUserAction(() => perform(download))}>
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
                  disabled={busy || state.subscriptions.length >= 10}
                  variant="secondary"
                  onClick={() =>
                    runUserAction(() =>
                      perform(async () =>
                        setState(
                          await actionData(
                            calendarSubscriptionsAction({ action: "create", config, includePersonalEvents }),
                          ),
                        ),
                      ),
                    )
                  }
                >
                  <Link aria-hidden className="size-4" />

                  {t("Planner.createSubscription")}
                </Button>

                <SectionRows>
                  {state.subscriptions.map((subscription, index) => (
                    <div key={subscription.id} className="flex items-center justify-between gap-2 py-2">
                      <span className="text-sm">{t("Planner.subscriptionNumber", { number: index + 1 })}</span>

                      <Button
                        aria-label={t("Planner.revokeSubscription")}
                        disabled={busy}
                        size="icon-sm"
                        variant="ghostDestructive"
                        onClick={() =>
                          runUserAction(() =>
                            perform(async () =>
                              setState(
                                await actionData(
                                  calendarSubscriptionsAction({ action: "revoke", id: subscription.id }),
                                ),
                              ),
                            ),
                          )
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
