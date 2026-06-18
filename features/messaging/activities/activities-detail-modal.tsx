"use client";

import type { ActivityEntryDto } from "@/ee/messaging/activities/activities.schema";

import { observer } from "mobx-react-lite";
import { useTranslations } from "next-intl";
import { ArrowLeft, ArrowRight, Calendar as CalendarIcon, ExternalLink, MapPin, Plus, Users } from "lucide-react";

import { MessagingProvider } from "@/generated/prisma";

import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { AppModal } from "@/components/modal/app-modal";
import { AppCard } from "@/components/card/app-card";
import { AppCardBody } from "@/components/card/app-card-body";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { IntlLink as Link } from "@/i18n/navigation";
import { EmailFrame } from "@/app/[locale]/(protected)/inbox/components/email-frame";
import { SanitizedHtml } from "@/app/[locale]/(protected)/inbox/components/sanitized-html";
import { sanitizeHtml } from "@/components/shared/sanitize-html";
import { isEmailProvider } from "@/ee/messaging/provider-icon";
import { messageSenderName } from "@/ee/messaging/thread-display";
import { useRootStore } from "@/core/stores/root-store.provider";
import { AuditDetail } from "./audit-detail";
import { DetailHeader, IdentityAvatar, TypeBadge } from "./activities-row";
import { cn } from "@/lib/utils";

const RESPONSE_LABEL_KEYS: Record<string, string> = {
  yes: "ContactHistory.calendarResponseYes",
  no: "ContactHistory.calendarResponseNo",
  maybe: "ContactHistory.calendarResponseMaybe",
  noreply: "ContactHistory.calendarResponseNoreply",
};

function looksLikeHtml(value: string): boolean {
  return /<\/?[a-z][^>]*>/i.test(value);
}

function payloadString(payload: Record<string, unknown>, key: string): string | null {
  const value = payload[key];
  return typeof value === "string" && value.trim() ? value : null;
}

const MessageDetail = observer(({ entry }: { entry: Extract<ActivityEntryDto, { kind: "message" }> }) => {
  const { intlStore, userStore } = useRootStore();
  const t = useTranslations();
  const { message, thread } = entry;
  const isOutbound = message.direction === "outbound";
  const senderName = messageSenderName(message) || (isOutbound ? t("Inbox.senderYou") : t("Inbox.senderUnknownSender"));
  const title = thread.type !== "single" ? thread.label?.trim() || senderName : senderName;
  const isEmail = isEmailProvider(message.provider) && Boolean(message.bodyHtml);
  const sanitized = !isEmail && message.bodyHtml ? sanitizeHtml(message.bodyHtml) : null;
  const DirectionIcon = isOutbound ? ArrowRight : ArrowLeft;
  const directionLabel = isOutbound ? t("Inbox.statusSent") : t("Inbox.statusReceived");

  return (
    <AppCard>
      <DetailHeader
        action={
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                asChild
                aria-label={t("ContactHistory.ariaOpenInInbox")}
                className="text-muted-foreground hover:text-foreground shrink-0"
                size="icon-sm"
                variant="ghost"
              >
                <Link href={`/inbox?threadId=${encodeURIComponent(message.messagingThreadId)}`}>
                  <ExternalLink className="size-4" />
                </Link>
              </Button>
            </TooltipTrigger>

            <TooltipContent>{t("ContactHistory.openInInbox")}</TooltipContent>
          </Tooltip>
        }
        avatar={
          <IdentityAvatar
            badge={<TypeBadge icon={DirectionIcon} label={directionLabel} tone={isOutbound ? "sent" : "received"} />}
            name={isOutbound ? [userStore.user?.firstName, userStore.user?.lastName] : senderName}
            src={
              isOutbound
                ? userStore.user?.avatarUrl || message.sender.pictureUrl
                : message.sender.contact?.avatarUrl || message.sender.pictureUrl
            }
          />
        }
        provider={message.provider}
        providerLabel={t(`Common.providers.${message.provider}`)}
        subtitle={`${directionLabel} · ${intlStore.formatNumericalShortDateTime(message.sentAt)}`}
        title={title}
      />

      <AppCardBody className="space-y-3">
        {message.subject && <h3 className="text-base font-semibold">{message.subject}</h3>}

        <div className="max-h-[60vh] overflow-auto">
          {isEmail ? (
            <div
              className={cn(
                "w-full rounded-2xl p-1.5 shadow-xs",
                isOutbound ? "bg-primary rounded-tr-sm" : "bg-muted rounded-tl-sm",
              )}
            >
              <EmailFrame html={message.bodyHtml ?? ""} />
            </div>
          ) : sanitized ? (
            <SanitizedHtml className="prose-sm max-w-none [&_a]:underline" html={message.bodyHtml ?? ""} />
          ) : message.bodyText ? (
            <p className="whitespace-pre-wrap text-sm leading-relaxed">{message.bodyText}</p>
          ) : (
            <p className="text-muted-foreground text-sm italic">{t("Inbox.attachmentUnsupported")}</p>
          )}
        </div>

        {message.attachmentsMeta.length > 0 && (
          <p className="text-muted-foreground text-xs">
            {`${t("Inbox.attachmentCount", { count: message.attachmentsMeta.length })} ${message.attachmentsMeta.map((a) => a.name).join(", ")}`}
          </p>
        )}
      </AppCardBody>
    </AppCard>
  );
});

const CalendarEventDetail = observer(
  ({ event }: { event: Extract<ActivityEntryDto, { kind: "calendar_event" }>["event"] }) => {
    const { intlStore } = useRootStore();
    const t = useTranslations();
    const organizerName = event.organizer?.displayName?.trim() || event.organizer?.email || null;
    const timeRange = event.allDay
      ? `${intlStore.formatNumericalShortDateTime(event.startsAt)} · ${t("ContactHistory.calendarAllDay")}`
      : `${intlStore.formatNumericalShortDateTime(event.startsAt)} – ${intlStore.formatTime(event.endsAt)}`;
    const description = event.description?.trim() || null;
    const calendarBadge = (
      <TypeBadge icon={CalendarIcon} label={t("EntityTimeline.types.activities")} tone="calendar" />
    );

    return (
      <AppCard>
        <DetailHeader
          action={
            event.conferenceUrl && (
              <Button asChild className="shrink-0" size="sm" variant="outline">
                <a href={event.conferenceUrl} rel="noopener noreferrer" target="_blank">
                  <ExternalLink className="size-3.5" />

                  {t("ContactHistory.calendarJoinMeeting")}
                </a>
              </Button>
            )
          }
          avatar={
            organizerName ? (
              <IdentityAvatar badge={calendarBadge} name={organizerName} />
            ) : (
              <div className="relative">
                <span className="bg-muted text-muted-foreground flex size-8 shrink-0 items-center justify-center rounded-lg">
                  <CalendarIcon aria-label={t("EntityTimeline.types.activities")} className="size-4" />
                </span>

                {calendarBadge}
              </div>
            )
          }
          provider={event.provider}
          providerLabel={t(`Common.providers.${event.provider}`)}
          subtitle={`${t("ContactHistory.calendarMeeting")} · ${timeRange}`}
          title={event.title}
        />

        <AppCardBody className="space-y-4">
          {event.status === "cancelled" && (
            <p className="text-destructive text-sm font-medium">{t("ContactHistory.calendarCancelled")}</p>
          )}

          {event.location && (
            <div className="text-muted-foreground flex items-center gap-2 text-sm">
              <MapPin className="size-3.5 shrink-0" />

              <span className="min-w-0 truncate">{event.location}</span>
            </div>
          )}

          {event.attendees.length > 0 && (
            <div className="space-y-2">
              <div className="text-muted-foreground flex items-center gap-2 text-xs font-medium uppercase tracking-wide">
                <Users className="size-3.5 shrink-0" />

                <span>{t("ContactHistory.calendarAttendees")}</span>
              </div>

              <ul className="space-y-1.5">
                {event.attendees.map((attendee) => {
                  const name = attendee.displayName?.trim() || attendee.email;
                  const responseKey = attendee.responseStatus ? RESPONSE_LABEL_KEYS[attendee.responseStatus] : null;
                  return (
                    <li key={attendee.email} className="flex items-center gap-2 text-sm">
                      <Avatar name={name} size="sm" />

                      <span className="min-w-0 flex-1 truncate">{name}</span>

                      {responseKey && (
                        <span className="text-muted-foreground shrink-0 text-xs">{t(responseKey as never)}</span>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          )}

          {description && (
            <div className="max-h-[40vh] overflow-auto">
              {looksLikeHtml(description) ? (
                <div className="bg-muted w-full rounded-2xl p-1.5 shadow-xs">
                  <EmailFrame html={description} />
                </div>
              ) : (
                <p className="whitespace-pre-wrap text-sm leading-relaxed">{description}</p>
              )}
            </div>
          )}
        </AppCardBody>
      </AppCard>
    );
  },
);

const ActivityDetail = observer(({ payload, at }: { payload: Record<string, unknown>; at: Date }) => {
  const { intlStore } = useRootStore();
  const t = useTranslations();
  const fullName = payloadString(payload, "fullName");
  const headline = payloadString(payload, "headline");
  const profileUrl = payloadString(payload, "profileUrl");
  const pictureUrl = payloadString(payload, "pictureUrl");

  return (
    <AppCard>
      <DetailHeader
        action={
          profileUrl && (
            <Button asChild className="shrink-0" size="sm" variant="outline">
              <a href={profileUrl} rel="noopener noreferrer" target="_blank">
                <ExternalLink className="size-3.5" />

                {t("ContactHistory.linkedinOpenProfile")}
              </a>
            </Button>
          )
        }
        avatar={
          <IdentityAvatar
            badge={<TypeBadge icon={Plus} label={t("EntityTimeline.types.activities")} tone="activity" />}
            name={fullName ?? ""}
            src={pictureUrl}
          />
        }
        provider={MessagingProvider.linkedin}
        providerLabel={t("Common.providers.linkedin")}
        subtitle={`${t("ContactHistory.linkedinConnectionAccepted")} · ${intlStore.formatNumericalShortDateTime(at)}`}
        title={fullName ?? t("Common.providers.linkedin")}
      />

      {headline && (
        <AppCardBody>
          <p className="text-muted-foreground text-sm">{headline}</p>
        </AppCardBody>
      )}
    </AppCard>
  );
});

export const TimelineDetailModal = observer(() => {
  const { intlStore, timelineDetailModalStore: store } = useRootStore();
  const t = useTranslations();
  const { isOpen } = store;
  const { entry, customColumns } = store.form;

  const title = !entry
    ? ""
    : entry.kind === "message"
      ? (entry.message.subject ??
        messageSenderName(entry.message) ??
        (entry.message.direction === "outbound" ? t("Inbox.senderYou") : t("Inbox.senderUnknownSender")))
      : entry.kind === "calendar_event"
        ? entry.event.title
        : entry.kind === "audit"
          ? t("AuditLogModal.eventAt", {
              event: t(`Common.events.${entry.event}`),
              date: intlStore.formatNumericalShortDateTime(entry.at),
            })
          : t("ContactHistory.linkedinConnectionAccepted");

  return (
    <AppModal open={isOpen} size={entry?.kind === "activity" ? "md" : "lg"} title={title} onClose={store.close}>
      {entry?.kind === "message" && <MessageDetail entry={entry} />}

      {entry?.kind === "calendar_event" && <CalendarEventDetail event={entry.event} />}

      {entry?.kind === "activity" && <ActivityDetail at={entry.at} payload={entry.payload} />}

      {entry?.kind === "audit" && <AuditDetail customColumns={customColumns} entry={entry} />}
    </AppModal>
  );
});
