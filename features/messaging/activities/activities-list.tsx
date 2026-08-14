"use client";

import type { ReactNode } from "react";
import type { MessagingMessageDto } from "@/ee/messaging/inbox/inbox.schema";
import type { ActivityEntryDto } from "@/ee/messaging/activities/activities.schema";
import type { CustomColumnDto } from "@/features/custom-column/custom-column.schema";

import { observer } from "mobx-react-lite";
import { useTranslations } from "next-intl";
import { ArrowLeft, ArrowRight, Calendar as CalendarIcon, Clock, Plus } from "lucide-react";
import { MessagingProvider } from "@/generated/prisma";

import { Icon } from "@/components/shared/icon";
import { sanitizeHtml } from "@/components/shared/sanitize-html";
import { classifyAttachment, PREVIEW_KIND_LABEL } from "@/ee/messaging/attachment-kind";
import { getProviderIcon } from "@/ee/messaging/provider-icon";
import { isUnipileUnsupportedBody, messageSenderName } from "@/ee/messaging/thread-display";
import { auditChangeLabel } from "@/components/entity-detail/audit-event-tone";
import { useCanonicalColumnLabel } from "@/components/entity-terminology/use-column-label";
import { Button } from "@/components/ui/button";
import { useRootStore } from "@/core/stores/root-store.provider";

import { auditCategory, IdentityAvatar, ProviderAvatar, TimelineRow, TypeBadge } from "./activities-row";
import { calendarEventTitle } from "./activity-labels";
import {
  buildCalendarSubtitle,
  buildMessageSubtitle,
  formatFieldList,
  resolveActorName,
  resolveMessagePreview,
  resolveMessageSenderName,
  resolveMessageTitle,
} from "./activity-row-labels";
import { activityEntryKey } from "./activity-entry-key";

type Props = {
  items: ActivityEntryDto[];
  customColumns: CustomColumnDto[];
  hasMore: boolean;
  loading: boolean;
  onLoadOlder: () => void;
};

function messagePreview(message: MessagingMessageDto): string | null {
  const subject = message.subject?.trim();
  if (subject) return subject;

  if (message.bodyHtml) {
    const text = sanitizeHtml(message.bodyHtml, { ALLOWED_TAGS: [] }).replace(/\s+/g, " ").trim();
    return text || null;
  }

  if (message.bodyText) return message.bodyText.replace(/\s+/g, " ").trim() || null;

  return null;
}

export const ActivitiesList = observer(({ customColumns, hasMore, items, loading, onLoadOlder }: Props) => {
  const t = useTranslations();
  const columnLabel = useCanonicalColumnLabel();
  const { intlStore, timelineDetailModalStore } = useRootStore();
  const customColumnsById = new Map(customColumns.map((c) => [c.id, c]));

  return (
    <>
      <ol className="flex flex-col">
        {items.map((entry, index) => {
          const isLast = index === items.length - 1 && !hasMore;
          const time = intlStore.formatRelativeTime(entry.at);

          if (entry.kind === "calendar_event") {
            const ev = entry.event;
            const duration = `${intlStore.formatTime(ev.startsAt)} – ${intlStore.formatTime(ev.endsAt)}`;
            const subtitle = buildCalendarSubtitle([
              duration,
              ev.location,
              ev.status === "cancelled" ? t("ContactHistory.calendarCancelled") : null,
            ]);
            const organizerName = ev.organizer?.displayName?.trim() || ev.organizer?.email;
            const calendarBadge = (
              <TypeBadge icon={CalendarIcon} label={t("EntityTimeline.types.activities")} tone="calendar" />
            );
            const CalendarProviderIcon = getProviderIcon(ev.provider);

            return (
              <TimelineRow
                key={activityEntryKey(entry)}
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
                isFirst={index === 0}
                isLast={isLast}
                subtitle={subtitle}
                time={time}
                title={calendarEventTitle(ev.title, t("ContactHistory.calendarNoTitle"))}
                titleIcon={
                  <CalendarProviderIcon
                    aria-label={t(`Common.providers.${ev.provider}`)}
                    className="text-muted-foreground size-3 shrink-0"
                  />
                }
                onClick={() => timelineDetailModalStore.openWith({ entry })}
              />
            );
          }

          if (entry.kind === "activity") {
            const subtitleValue = entry.payload.headline ?? entry.payload.fullName;

            return (
              <TimelineRow
                key={activityEntryKey(entry)}
                avatar={
                  <ProviderAvatar
                    badge={<TypeBadge icon={Plus} label={t("EntityTimeline.types.activities")} tone="activity" />}
                    label={t("Common.providers.linkedin")}
                    provider={MessagingProvider.linkedin}
                  />
                }
                isFirst={index === 0}
                isLast={isLast}
                subtitle={
                  typeof subtitleValue === "string" && subtitleValue.trim() ? (
                    subtitleValue
                  ) : (
                    <span className="italic opacity-80">{t("Common.providers.linkedin")}</span>
                  )
                }
                time={time}
                title={t("ContactHistory.linkedinConnectionAccepted")}
                onClick={() => timelineDetailModalStore.openWith({ entry })}
              />
            );
          }

          if (entry.kind === "message") {
            const { message, thread, senderIsMine } = entry;
            const isOutbound = message.direction === "outbound";
            const isGroup = thread.type !== "single";
            const providerLabel = t(`Common.providers.${message.provider}`);
            const directionLabel = isOutbound ? t("Inbox.statusSent") : t("Inbox.statusReceived");
            const DirectionIcon = isOutbound ? ArrowRight : ArrowLeft;
            const messageBadge = (
              <TypeBadge icon={DirectionIcon} label={directionLabel} tone={isOutbound ? "sent" : "received"} />
            );
            const senderLabel = messageSenderName(message);
            const senderName = resolveMessageSenderName(
              senderLabel,
              senderIsMine,
              t("Inbox.senderYou"),
              t("Inbox.senderUnknownSender"),
            );
            const title = resolveMessageTitle(isGroup, thread.label, senderName);
            const rawPreview = messagePreview(message);
            const preview = resolveMessagePreview(rawPreview, isUnipileUnsupportedBody(rawPreview));
            const firstAttachment = message.attachmentsMeta[0];
            const attachmentKindLabel =
              !preview && firstAttachment ? t(PREVIEW_KIND_LABEL[classifyAttachment(firstAttachment)]) : null;
            const subtitleModel = buildMessageSubtitle({
              preview,
              isGroup,
              senderIsMine,
              senderName,
              youPrefix: t("Inbox.youPrefix"),
              attachmentKindLabel,
            });

            let subtitle: ReactNode;
            if (subtitleModel.kind === "prefixedPreview") {
              subtitle = (
                <>
                  <span className="font-semibold">{subtitleModel.prefix} </span>

                  {subtitleModel.preview}
                </>
              );
            } else if (subtitleModel.kind === "preview") subtitle = subtitleModel.preview;
            else if (subtitleModel.kind === "attachmentKind") subtitle = subtitleModel.label;
            else subtitle = <span className="italic opacity-80">{t("Inbox.attachmentUnsupported")}</span>;

            const MessageProviderIcon = getProviderIcon(message.provider);

            return (
              <TimelineRow
                key={activityEntryKey(entry)}
                avatar={
                  <IdentityAvatar
                    badge={messageBadge}
                    name={senderLabel || title}
                    src={message.sender.contact?.avatarUrl || message.sender.pictureUrl}
                  />
                }
                isFirst={index === 0}
                isLast={isLast}
                subtitle={subtitle}
                time={time}
                title={title}
                titleIcon={
                  <MessageProviderIcon aria-label={providerLabel} className="text-muted-foreground size-3 shrink-0" />
                }
                onClick={() => timelineDetailModalStore.openWith({ entry })}
              />
            );
          }

          const actorName = resolveActorName(entry.actor.firstName, entry.actor.lastName, entry.actor.email);
          const fields = formatFieldList(
            entry.changes.map((c) => auditChangeLabel(c, customColumnsById, t, columnLabel)),
          );
          const category = auditCategory(entry.event);

          return (
            <TimelineRow
              key={activityEntryKey(entry)}
              avatar={
                <IdentityAvatar
                  badge={
                    <TypeBadge icon={category.icon} label={t(`Common.events.${entry.event}`)} tone={category.tone} />
                  }
                  name={[entry.actor.firstName, entry.actor.lastName]}
                  src={entry.actor.avatarUrl}
                />
              }
              isFirst={index === 0}
              isLast={isLast}
              subtitle={fields || t(`Common.events.${entry.event}`)}
              time={time}
              title={actorName}
              onClick={() => timelineDetailModalStore.openWith({ entry, customColumns })}
            />
          );
        })}
      </ol>

      {hasMore && (
        <div className="flex justify-center pt-2">
          <Button disabled={loading} size="sm" type="button" variant="ghost" onClick={onLoadOlder}>
            {t("EntityTimeline.loadOlder")}
          </Button>
        </div>
      )}
    </>
  );
});

export function TimelineNotice({ label }: { label: string }) {
  return <p className="bg-muted text-muted-foreground mb-2 rounded-md px-3 py-2 text-xs">{label}</p>;
}

export function TimelineEmptyState({ label }: { label: string }) {
  return (
    <div className="border-border bg-card text-muted-foreground flex items-center gap-2 rounded-md border px-4 py-6 text-sm">
      <Icon className="size-3.5" icon={Clock} />

      <span>{label}</span>
    </div>
  );
}
