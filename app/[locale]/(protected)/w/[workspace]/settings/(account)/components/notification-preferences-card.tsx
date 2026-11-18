"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import type { NotificationPreferencesDto } from "@/features/notifications/notification.schema";

import { AppCard } from "@/components/card/app-card";
import { AppCardBody } from "@/components/card/app-card-body";
import { AppCardHeader } from "@/components/card/app-card-header";
import { FormIsoDatePicker } from "@/components/forms/form-iso-date-picker";
import { Label } from "@/components/ui/label";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useHydratedIntlStore } from "@/core/stores/use-hydrated-intl-store";
import { browserTimeZone } from "@/core/utils/time-zone";
import { toastZodErrorTree } from "@/core/utils/toast-zod-error-tree";
import { NOTIFICATION_EMAIL_MODES } from "@/features/notifications/notification.schema";

import { addDaysToIso, dateOfIso, isoDateOf } from "./notification-pause-dates";
import { setNotificationPauseAction, setNotificationPreferencesAction } from "./notification-preferences-actions";

type Props = { initial: NotificationPreferencesDto };

type Mode = (typeof NOTIFICATION_EMAIL_MODES)[number];

const PAUSE_DEFAULT_DAYS = 7;

export function NotificationPreferencesCard({ initial }: Props) {
  const t = useTranslations();
  const intlStore = useHydratedIntlStore();
  const [preferences, setPreferences] = useState(initial.preferences);
  const [pausedUntil, setPausedUntil] = useState(initial.pausedUntil);
  const [pending, startTransition] = useTransition();

  const change = (kind: NotificationPreferencesDto["preferences"][number]["kind"], emailMode: Mode) => {
    const previous = preferences;
    setPreferences((current) => current.map((item) => (item.kind === kind ? { ...item, emailMode } : item)));
    startTransition(async () => {
      const result = await setNotificationPreferencesAction({ preferences: [{ kind, emailMode }] });
      if (!result.ok) {
        setPreferences(previous);
        toastZodErrorTree(result.error);
        return;
      }
      setPreferences(result.data.preferences);
      setPausedUntil(result.data.pausedUntil);
      toast.success(t("Common.notifications.updated"));
    });
  };

  const formatDate = (until: string) => intlStore.formatDescriptiveLongDate(dateOfIso(until));

  const savePause = (until: string | null) => {
    startTransition(async () => {
      const result = await setNotificationPauseAction({ until, timeZone: browserTimeZone() });
      if (!result.ok) {
        toastZodErrorTree(result.error);
        return;
      }
      setPreferences(result.data.preferences);
      setPausedUntil(result.data.pausedUntil);
      if (result.data.pausedUntil)
        toast.success(t("Notifications.preferences.pauseOn", { date: formatDate(result.data.pausedUntil) }));
      else toast.success(t("Notifications.preferences.pauseOff"));
    });
  };

  const togglePause = (on: boolean) => {
    savePause(on ? addDaysToIso(isoDateOf(new Date()), PAUSE_DEFAULT_DAYS) : null);
  };

  const moveEnd = (until: string | undefined) => {
    if (until && until !== pausedUntil) savePause(until);
  };

  if (initial.emailConfigured === false) {
    return (
      <AppCard className="max-w-3xl">
        <AppCardHeader className="flex-col items-start gap-1">
          <h2 className="text-base font-semibold">{t("Notifications.preferences.title")}</h2>
        </AppCardHeader>

        <AppCardBody>
          <p className="text-sm text-muted-foreground" data-notification-email-unconfigured="">
            {t("Notifications.preferences.emailNotConfigured")}
          </p>
        </AppCardBody>
      </AppCard>
    );
  }

  return (
    <AppCard className="max-w-3xl">
      <AppCardHeader className="flex-col items-start gap-1">
        <h2 className="text-base font-semibold">{t("Notifications.preferences.title")}</h2>

        <p className="text-sm text-muted-foreground">{t("Notifications.preferences.description")}</p>
      </AppCardHeader>

      <AppCardBody>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("Notifications.preferences.kind")}</TableHead>

              <TableHead>{t("Notifications.preferences.title")}</TableHead>
            </TableRow>
          </TableHeader>

          <TableBody>
            {preferences.map((preference) => {
              const kindLabel = t(`Notifications.kinds.${preference.kind}`);

              return (
                <TableRow key={preference.kind} data-notification-kind={preference.kind}>
                  <TableCell className="align-middle whitespace-normal">
                    <div className="flex min-w-0 flex-col gap-0.5">
                      <span className="text-sm font-medium">{kindLabel}</span>

                      <p className="text-xs text-muted-foreground">{t(`Notifications.kindHelp.${preference.kind}`)}</p>
                    </div>
                  </TableCell>

                  <TableCell className="w-px align-middle">
                    <SegmentedControl
                      idPrefix={`notification-${preference.kind}`}
                      items={NOTIFICATION_EMAIL_MODES.map((mode) => ({
                        value: mode,
                        label: t(`Notifications.emailMode.${mode}`),
                        disabled: pending || pausedUntil !== null,
                      }))}
                      label={t("Notifications.preferences.modeLabel", { kind: kindLabel })}
                      listClassName="w-max auto-cols-max"
                      value={preference.emailMode}
                      onValueChange={(value) => change(preference.kind, value)}
                    />
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>

        <div className="flex flex-col gap-2 border-t border-border pt-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <Switch
                checked={pausedUntil !== null}
                disabled={pending}
                id="notification-pause"
                onCheckedChange={togglePause}
              />

              <Label htmlFor="notification-pause">{t("Notifications.preferences.pause")}</Label>
            </div>

            {pausedUntil ? (
              <FormIsoDatePicker
                className="w-56"
                clearable={false}
                id="notification-pause-until"
                label={null}
                min={addDaysToIso(isoDateOf(new Date()), 1)}
                placeholder={t("Notifications.preferences.pauseDate")}
                value={pausedUntil}
                onValueChange={moveEnd}
              />
            ) : null}
          </div>

          <p className="text-xs text-muted-foreground">{t("Notifications.preferences.pauseHelp")}</p>
        </div>
      </AppCardBody>
    </AppCard>
  );
}
