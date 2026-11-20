"use client";

import { useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import type { NotificationPreferencesDto } from "@/features/notifications/notification.schema";

import { NOTIFICATION_KIND_OFF_NOTICE } from "@/features/notifications/notification.schema";

type Translate = ReturnType<typeof useTranslations>;

function kindLabel(t: Translate, kind: string | null): string | null {
  switch (kind) {
    case "dueToday":
      return t("Notifications.kinds.dueToday");
    case "replyReceived":
      return t("Notifications.kinds.replyReceived");
    case "ruleAlert":
      return t("Notifications.kinds.ruleAlert");
    default:
      return null;
  }
}

type Props = { preferences: NotificationPreferencesDto["preferences"] };

export function NotificationNoticeToast({ preferences }: Props) {
  const t = useTranslations();
  const searchParams = useSearchParams();

  useEffect(() => {
    if (searchParams.get("notice") !== NOTIFICATION_KIND_OFF_NOTICE) return;
    const kind = searchParams.get("kind");
    const isOff = preferences.some((preference) => preference.kind === kind && preference.emailMode === "off");
    const label = isOff ? kindLabel(t, kind) : null;

    const timer = setTimeout(() => {
      if (label) toast.success(t("Notifications.preferences.kindOffNotice", { kind: label }));
    }, 0);

    const params = new URLSearchParams(searchParams.toString());
    params.delete("notice");
    params.delete("kind");
    const query = params.toString();
    const path = window.location.pathname;
    window.history.replaceState(null, "", query ? `${path}?${query}` : path);

    return () => clearTimeout(timer);
  }, [preferences, searchParams, t]);

  return null;
}
