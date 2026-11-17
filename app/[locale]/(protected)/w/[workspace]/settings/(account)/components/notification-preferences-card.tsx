"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import type { NotificationPreferencesDto } from "@/features/notifications/notification.schema";
import type { NotificationPause } from "./notification-pause";

import { AppCard } from "@/components/card/app-card";
import { AppCardBody } from "@/components/card/app-card-body";
import { AppCardHeader } from "@/components/card/app-card-header";
import { FormIsoDatePicker } from "@/components/forms/form-iso-date-picker";
import { Label } from "@/components/ui/label";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useHydratedIntlStore } from "@/core/stores/use-hydrated-intl-store";
import { toastZodErrorTree } from "@/core/utils/toast-zod-error-tree";
import { NOTIFICATION_EMAIL_MODES } from "@/features/notifications/notification.schema";

import { setNotificationPreferencesAction } from "./notification-preferences-actions";
import {
  NOTIFICATION_PAUSE_STORAGE_KEY,
  addDaysToIso,
  dateOfIso,
  isNotificationPauseOver,
  isoDateOf,
  modesToPreferences,
  parseNotificationPause,
  pausedModes,
  rememberModes,
  restoredModes,
  serializeNotificationPause,
} from "./notification-pause";

type Props = { initial: NotificationPreferencesDto };

type Mode = (typeof NOTIFICATION_EMAIL_MODES)[number];

const PAUSE_DEFAULT_DAYS = 7;

function readStoredPause(): NotificationPause | null {
  try {
    return parseNotificationPause(window.localStorage.getItem(NOTIFICATION_PAUSE_STORAGE_KEY));
  } catch {
    return null;
  }
}

function storePause(pause: NotificationPause | null) {
  try {
    if (pause) window.localStorage.setItem(NOTIFICATION_PAUSE_STORAGE_KEY, serializeNotificationPause(pause));
    else window.localStorage.removeItem(NOTIFICATION_PAUSE_STORAGE_KEY);
  } catch {
    return;
  }
}

export function NotificationPreferencesCard({ initial }: Props) {
  const t = useTranslations();
  const intlStore = useHydratedIntlStore();
  const [preferences, setPreferences] = useState(initial.preferences);
  const [pause, setPause] = useState<NotificationPause | null>(null);
  const [pending, startTransition] = useTransition();
  const pauseChecked = useRef(false);

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
      toast.success(t("Common.notifications.updated"));
    });
  };

  const resume = useCallback(
    (stored: NotificationPause) => {
      startTransition(async () => {
        const result = await setNotificationPreferencesAction({
          preferences: modesToPreferences(restoredModes(stored)),
        });
        if (!result.ok) {
          toastZodErrorTree(result.error);
          return;
        }
        storePause(null);
        setPause(null);
        setPreferences(result.data.preferences);
        toast.success(t("Notifications.preferences.pauseOff"));
      });
    },
    [t],
  );

  useEffect(() => {
    if (pauseChecked.current) return;
    pauseChecked.current = true;
    const stored = readStoredPause();
    if (!stored) return;
    if (isNotificationPauseOver(stored, isoDateOf(new Date()))) resume(stored);
    else setPause(stored);
  }, [resume]);

  const formatDate = (until: string) => intlStore.formatDescriptiveLongDate(dateOfIso(until));

  const startPause = (until: string) => {
    const next: NotificationPause = { until, previous: rememberModes(preferences) };
    startTransition(async () => {
      const result = await setNotificationPreferencesAction({ preferences: modesToPreferences(pausedModes()) });
      if (!result.ok) {
        toastZodErrorTree(result.error);
        return;
      }
      storePause(next);
      setPause(next);
      setPreferences(result.data.preferences);
      toast.success(t("Notifications.preferences.pauseOn", { date: formatDate(until) }));
    });
  };

  const moveEnd = (until: string | undefined) => {
    if (!pause || !until) return;
    const next = { ...pause, until };
    if (isNotificationPauseOver(next, isoDateOf(new Date()))) {
      resume(pause);
      return;
    }
    storePause(next);
    setPause(next);
    toast.success(t("Notifications.preferences.pauseOn", { date: formatDate(until) }));
  };

  const togglePause = (on: boolean) => {
    if (on) startPause(addDaysToIso(isoDateOf(new Date()), PAUSE_DEFAULT_DAYS));
    else if (pause) resume(pause);
  };

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

                  <TableCell className="w-[21rem] min-w-[21rem] align-middle">
                    <SegmentedControl
                      idPrefix={`notification-${preference.kind}`}
                      items={NOTIFICATION_EMAIL_MODES.map((mode) => ({
                        value: mode,
                        label: t(`Notifications.emailMode.${mode}`),
                        disabled: pending || pause !== null,
                      }))}
                      label={t("Notifications.preferences.modeLabel", { kind: kindLabel })}
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
                checked={pause !== null}
                disabled={pending}
                id="notification-pause"
                onCheckedChange={togglePause}
              />

              <Label htmlFor="notification-pause">{t("Notifications.preferences.pause")}</Label>
            </div>

            {pause ? (
              <FormIsoDatePicker
                className="w-56"
                clearable={false}
                id="notification-pause-until"
                label={null}
                placeholder={t("Notifications.preferences.pauseDate")}
                value={pause.until}
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
