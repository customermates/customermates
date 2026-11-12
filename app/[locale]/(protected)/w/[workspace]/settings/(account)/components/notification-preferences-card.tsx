"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import type { NotificationPreferencesDto } from "@/features/notifications/notification.schema";

import { AppCard } from "@/components/card/app-card";
import { AppCardBody } from "@/components/card/app-card-body";
import { AppCardHeader } from "@/components/card/app-card-header";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toastZodErrorTree } from "@/core/utils/toast-zod-error-tree";
import { NOTIFICATION_EMAIL_MODES } from "@/features/notifications/notification.schema";

import { setNotificationPreferencesAction } from "./notification-preferences-actions";

type Props = { initial: NotificationPreferencesDto };

type Mode = (typeof NOTIFICATION_EMAIL_MODES)[number];

export function NotificationPreferencesCard({ initial }: Props) {
  const t = useTranslations();
  const [preferences, setPreferences] = useState(initial.preferences);
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
      toast.success(t("Common.notifications.updated"));
    });
  };

  return (
    <AppCard className="max-w-3xl">
      <AppCardHeader className="flex-col items-start gap-1">
        <h2 className="text-base font-semibold">{t("Notifications.preferences.title")}</h2>

        <p className="text-sm text-muted-foreground">{t("Notifications.preferences.description")}</p>
      </AppCardHeader>

      <AppCardBody>
        {preferences.map((preference) => (
          <div key={preference.kind} className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex min-w-0 flex-col gap-0.5">
              <Label htmlFor={`notification-${preference.kind}`}>{t(`Notifications.kinds.${preference.kind}`)}</Label>

              <p className="text-xs text-muted-foreground">{t(`Notifications.kindHelp.${preference.kind}`)}</p>
            </div>

            <Select
              disabled={pending}
              value={preference.emailMode}
              onValueChange={(value) => change(preference.kind, value as Mode)}
            >
              <SelectTrigger className="w-44" id={`notification-${preference.kind}`}>
                <SelectValue />
              </SelectTrigger>

              <SelectContent>
                {NOTIFICATION_EMAIL_MODES.map((mode) => (
                  <SelectItem key={mode} value={mode}>
                    {t(`Notifications.emailMode.${mode}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ))}
      </AppCardBody>
    </AppCard>
  );
}
