"use client";

import type { ActivityEntryDto } from "@/ee/messaging/activities/activities.schema";

import { observer } from "mobx-react-lite";
import { useTranslations } from "next-intl";
import { ArrowLeft, ArrowRight, Calendar as CalendarIcon, ExternalLink, MapPin, Plus, Users } from "lucide-react";

import { MessagingProvider } from "@/generated/prisma";

import { Avatar } from "@/components/ui/avatar";
import { AppModal, type AppModalActions } from "@/components/modal";
import { AppCard } from "@/components/card/app-card";
import { AppCardBody } from "@/components/card/app-card-body";
import { EmailFrame } from "@/app/[locale]/(protected)/inbox/components/email-frame";
import { SanitizedHtml } from "@/components/shared/sanitized-html";
import { sanitizeHtml } from "@/components/shared/sanitize-html";
import { cn } from "@/core/utils/cn";
import { isEmailProvider } from "@/ee/messaging/provider";
import { messageSenderName } from "@/ee/messaging/thread-display";
import { useRootStore } from "@/core/stores/root-store.provider";
import { useHydratedIntlStore } from "@/core/stores/use-hydrated-intl-store";
import { AuditDetail } from "./audit-detail";
import { calendarEventTitle } from "./activity-labels";
import { DetailHeader, IdentityAvatar, TypeBadge } from "./activities-row";

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
  const intlStore = useHydratedIntlStore();
  const t = useTranslations();
  const { message, thread, senderIsMine } = entry;
  const isOutbound = message.direction === "outbound";
  const senderName =
    messageSenderName(message) || (senderIsMine ? t("Inbox.senderYou") : t("Inbox.senderUnknownSender"));
  const title = thread.type !== "single" ? thread.label?.trim() || senderName : senderName;
  const isEmail = isEmailProvider(message.provider) && Boolean(message.bodyHtml);
  const sanitized = !isEmail && message.bodyHtml ? sanitizeHtml(message.bodyHtml) : null;
  const DirectionIcon = isOutbound ? ArrowRight : ArrowLeft;
  const directionLabel = isOutbound ? t("Inbox.statusSent") : t("Inbox.statusReceived");

  return (
    <AppCard>
      <DetailHeader
        avatar={
          <IdentityAvatar
            badge={<TypeBadge icon={DirectionIcon} label={directionLabel} tone={isOutbound ? "sent" : "received"} />}
            name={senderName}
            size="xl"
            src={message.sender.contact?.avatarUrl || message.sender.pictureUrl}
          />
        }
        provider={message.provider}
        providerLabel={t(`Common.providers.${message.provider}`)}
        records={entry.records}
        subtitle={`${directionLabel} · ${intlStore.formatNumericalShortDateTime(message.sentAt)}`}
        title={title}
      />

      <AppCardBody className="space-y-3">
        {message.subject && <h3 className="text-base font-semibold">{message.subject}</h3>}

        <div>
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

const CalendarEventDetail = observer(({ entry }: { entry: Extract<ActivityEntryDto, { kind: "calendar_event" }> }) => {
  const { event } = entry;
  const intlStore = useHydratedIntlStore();
  const t = useTranslations();
  const organizerName = event.organizer?.displayName?.trim() || event.organizer?.email || null;
  const timeRange = event.allDay
    ? `${intlStore.formatNumericalShortDateTime(event.startsAt)} · ${t("ContactHistory.calendarAllDay")}`
    : `${intlStore.formatNumericalShortDateTime(event.startsAt)} – ${intlStore.formatTime(event.endsAt)}`;
  const description = event.description?.trim() || null;
  const eventTitle = calendarEventTitle(event.title, t("ContactHistory.calendarNoTitle"));
  const calendarBadge = <TypeBadge icon={CalendarIcon} label={t("EntityTimeline.types.activities")} tone="calendar" />;

  return (
    <AppCard>
      <DetailHeader
        avatar={
          organizerName ? (
            <IdentityAvatar badge={calendarBadge} name={organizerName} size="xl" />
          ) : (
            <div className="relative">
              <span className="bg-muted text-muted-foreground flex size-16 shrink-0 items-center justify-center rounded-lg">
                <CalendarIcon aria-label={t("EntityTimeline.types.activities")} className="size-6" />
              </span>

              {calendarBadge}
            </div>
          )
        }
        provider={event.provider}
        providerLabel={t(`Common.providers.${event.provider}`)}
        records={entry.records}
        subtitle={`${t("ContactHistory.calendarMeeting")} · ${timeRange}`}
        title={eventTitle}
      />

      <AppCardBody className="space-y-4">
        {event.status !== "cancelled" && !event.location && event.attendees.length === 0 && !description && (
          <p className="text-muted-foreground text-sm">{t("EntityTimeline.noFurtherDetail")}</p>
        )}

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
          <div>
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
});

const ActivityDetail = observer(({ entry }: { entry: Extract<ActivityEntryDto, { kind: "activity" }> }) => {
  const { payload, at } = entry;
  const intlStore = useHydratedIntlStore();
  const t = useTranslations();
  const fullName = payloadString(payload, "fullName");
  const headline = payloadString(payload, "headline");
  const pictureUrl = payloadString(payload, "pictureUrl");

  return (
    <AppCard>
      <DetailHeader
        avatar={
          <IdentityAvatar
            badge={<TypeBadge icon={Plus} label={t("EntityTimeline.types.activities")} tone="activity" />}
            name={fullName ?? ""}
            size="xl"
            src={pictureUrl}
          />
        }
        provider={MessagingProvider.linkedin}
        providerLabel={t("Common.providers.linkedin")}
        records={entry.records}
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
  const { timelineDetailModalStore: store } = useRootStore();
  const intlStore = useHydratedIntlStore();
  const t = useTranslations();
  const { isOpen } = store;
  const { entry, customColumns } = store.form;

  const title = !entry
    ? ""
    : entry.kind === "message"
      ? (entry.message.subject ??
        messageSenderName(entry.message) ??
        (entry.senderIsMine ? t("Inbox.senderYou") : t("Inbox.senderUnknownSender")))
      : entry.kind === "calendar_event"
        ? calendarEventTitle(entry.event.title, t("ContactHistory.calendarNoTitle"))
        : entry.kind === "audit"
          ? t("AuditLogModal.eventAt", {
              event: t(`Common.events.${entry.event}`),
              date: intlStore.formatNumericalShortDateTime(entry.at),
            })
          : t("ContactHistory.linkedinConnectionAccepted");
  const activityProfileUrl = entry?.kind === "activity" ? payloadString(entry.payload, "profileUrl") : null;

  const actions: AppModalActions =
    entry?.kind === "message"
      ? [
          {
            id: "open-message-in-inbox",
            label: t("ContactHistory.ariaOpenInInbox"),
            icon: ExternalLink,
            href: `/inbox?threadId=${encodeURIComponent(entry.message.messagingThreadId)}`,
          },
        ]
      : entry?.kind === "calendar_event" && entry.event.conferenceUrl
        ? [
            {
              id: "join-calendar-meeting",
              label: t("ContactHistory.calendarJoinMeeting"),
              icon: ExternalLink,
              href: entry.event.conferenceUrl,
              external: true,
            },
          ]
        : entry?.kind === "activity" && activityProfileUrl
          ? [
              {
                id: "open-linkedin-profile",
                label: t("ContactHistory.linkedinOpenProfile"),
                icon: ExternalLink,
                href: activityProfileUrl,
                external: true,
              },
            ]
          : [];

  return (
    <AppModal
      actions={actions}
      description={t("EntityTimeline.detailDescription")}
      open={isOpen}
      size={entry?.kind === "activity" ? "md" : "lg"}
      title={title}
      onClose={store.close}
    >
      {entry?.kind === "message" && <MessageDetail entry={entry} />}

      {entry?.kind === "calendar_event" && <CalendarEventDetail entry={entry} />}

      {entry?.kind === "activity" && <ActivityDetail entry={entry} />}

      {entry?.kind === "audit" && <AuditDetail customColumns={customColumns} entry={entry} />}
    </AppModal>
  );
});
