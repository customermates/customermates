import type { LucideIcon } from "lucide-react";
import type { NotificationDto } from "@/features/notifications/notification.schema";

import { CalendarDays, Clock, Mail, Zap } from "lucide-react";

const CALENDAR_PATH = "/calendar";

export type NotificationKindVisual = { icon: LucideIcon; tone: string };

export function notificationKindVisual(item: Pick<NotificationDto, "kind" | "href">): NotificationKindVisual {
  switch (item.kind) {
    case "dueToday":
      return { icon: Clock, tone: "bg-warning/12 text-warning-soft-foreground" };
    case "replyReceived":
      return { icon: Mail, tone: "bg-info/12 text-info-soft-foreground" };
    case "ruleAlert":
      return {
        icon: item.href?.startsWith(CALENDAR_PATH) ? CalendarDays : Zap,
        tone: "bg-primary/10 text-primary",
      };
  }
}
