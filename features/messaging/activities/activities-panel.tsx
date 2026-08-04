"use client";

import type { ReactNode } from "react";
import type { MessagingMessageDto } from "@/ee/messaging/inbox/inbox.schema";
import type { ActivitiesResult } from "@/ee/messaging/activities/activities.schema";
import type { EntityType } from "@/generated/prisma";
import { MessagingProvider } from "@/generated/prisma";

import { sanitizeHtml } from "@/components/shared/sanitize-html";

import { observer } from "mobx-react-lite";
import { useEffect } from "react";
import { useTranslations } from "next-intl";
import { ArrowLeft, ArrowRight, Calendar as CalendarIcon, Clock, Plus } from "lucide-react";

import { classifyAttachment, PREVIEW_KIND_LABEL } from "@/ee/messaging/attachment-kind";
import { getProviderIcon } from "@/ee/messaging/provider-icon";
import { isUnipileUnsupportedBody, messageSenderName } from "@/ee/messaging/thread-display";
import { auditChangeLabel } from "@/components/entity-detail/audit-event-tone";
import { useColumnLabel } from "@/components/entity-terminology/use-column-label";
import { Button } from "@/components/ui/button";
import { FilterPopover } from "@/components/data-view/header/filter-popover";
import { DataViewActiveFiltersBar } from "@/components/data-view/header/active-filters-bar";
import { Icon } from "@/components/shared/icon";
import { useRootStore } from "@/core/stores/root-store.provider";

import {
  auditCategory,
  IdentityAvatar,
  ProviderAvatar,
  TimelineRow,
  TypeBadge,
} from "@/features/messaging/activities/activities-row";

const INLINE_FIELD_LIMIT = 3;

type Props = {
  entityType: EntityType;
  entityId: string;
  initial: ActivitiesResult;
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

function formatFieldList(fields: string[]): string {
  if (fields.length === 0) return "";
  const visible = fields.slice(0, INLINE_FIELD_LIMIT);
  const overflow = fields.length - visible.length;
  return overflow > 0 ? `${visible.join(" · ")} +${overflow}` : visible.join(" · ");
}

export const EntityTimelinePanel = observer(({ entityType, entityId, initial }: Props) => {
  const t = useTranslations();
  const columnLabel = useColumnLabel();
  const { intlStore, timelineDetailModalStore, activitiesStore: store } = useRootStore();

  useEffect(() => {
    store.init(entityType, entityId, initial);
  }, [store, entityType, entityId, initial]);

  const customColumnsById = new Map(store.customColumns.map((c) => [c.id, c]));

  return (
    <div className="flex h-full flex-col">
      <div className="flex shrink-0 items-center gap-2 px-4 pt-4 pb-2">
        <Icon className="text-muted-foreground size-3.5" icon={Clock} />

        <span className="text-muted-foreground text-[11px] font-medium uppercase tracking-wide">
          {t("Common.actions.labelHistory")}
        </span>

        <div className="ml-auto flex items-center gap-1.5">
          <FilterPopover compact store={store} />
        </div>
      </div>

      <DataViewActiveFiltersBar noBorder store={store} />

      <div className="min-h-0 flex-1 overflow-auto px-2 pt-2 pb-4">
        {store.items.length === 0 ? (
          <div className="border-border bg-card text-muted-foreground flex items-center gap-2 rounded-md border px-4 py-6 text-sm">
            <Icon className="size-3.5" icon={Clock} />

            <span>{t("ContactHistory.noActivity")}</span>
          </div>
        ) : (
          <>
            <ol className="flex flex-col">
              {store.items.map((entry, index) => {
                const isLast = index === store.items.length - 1 && !store.hasMore;
                const time = intlStore.formatRelativeTime(entry.at);

                if (entry.kind === "calendar_event") {
                  const ev = entry.event;
                  const duration = `${intlStore.formatTime(ev.startsAt)} – ${intlStore.formatTime(ev.endsAt)}`;
                  const subtitleParts: string[] = [duration];
                  if (ev.location) subtitleParts.push(ev.location);
                  if (ev.status === "cancelled") subtitleParts.push(t("ContactHistory.calendarCancelled"));
                  const organizerName = ev.organizer?.displayName?.trim() || ev.organizer?.email;
                  const calendarBadge = (
                    <TypeBadge icon={CalendarIcon} label={t("EntityTimeline.types.activities")} tone="calendar" />
                  );
                  const CalendarProviderIcon = getProviderIcon(ev.provider);
                  return (
                    <TimelineRow
                      key={entry.id}
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
                      subtitle={subtitleParts.join(" · ")}
                      time={time}
                      title={ev.title}
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
                      key={entry.id}
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
                  const senderName =
                    senderLabel || (senderIsMine ? t("Inbox.senderYou") : t("Inbox.senderUnknownSender"));
                  const title = isGroup ? thread.label?.trim() || senderName : senderName;
                  const rawPreview = messagePreview(message);
                  const isUnsupported = isUnipileUnsupportedBody(rawPreview);
                  const preview = rawPreview && !isUnsupported ? rawPreview : null;
                  const firstAttachment = message.attachmentsMeta[0];
                  const kindLabel =
                    !preview && firstAttachment ? t(PREVIEW_KIND_LABEL[classifyAttachment(firstAttachment)]) : null;

                  let subtitle: ReactNode;
                  if (preview && isGroup) {
                    subtitle = (
                      <>
                        <span className="font-semibold">{senderIsMine ? t("Inbox.youPrefix") : `${senderName}:`} </span>

                        {preview}
                      </>
                    );
                  } else if (preview) subtitle = preview;
                  else if (kindLabel) subtitle = kindLabel;
                  else subtitle = <span className="italic opacity-80">{t("Inbox.attachmentUnsupported")}</span>;

                  const MessageProviderIcon = getProviderIcon(message.provider);

                  return (
                    <TimelineRow
                      key={entry.id}
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
                        <MessageProviderIcon
                          aria-label={providerLabel}
                          className="text-muted-foreground size-3 shrink-0"
                        />
                      }
                      onClick={() => timelineDetailModalStore.openWith({ entry })}
                    />
                  );
                }

                const actorName = `${entry.actor.firstName} ${entry.actor.lastName}`.trim() || entry.actor.email;
                const fields = formatFieldList(
                  entry.changes.map((c) => auditChangeLabel(c, customColumnsById, t, columnLabel)),
                );
                const category = auditCategory(entry.event);

                return (
                  <TimelineRow
                    key={entry.id}
                    avatar={
                      <IdentityAvatar
                        badge={
                          <TypeBadge
                            icon={category.icon}
                            label={t(`Common.events.${entry.event}`)}
                            tone={category.tone}
                          />
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
                    onClick={() => timelineDetailModalStore.openWith({ entry, customColumns: store.customColumns })}
                  />
                );
              })}
            </ol>

            {store.hasMore && (
              <div className="flex justify-center pt-2">
                <Button
                  disabled={store.loading}
                  size="sm"
                  type="button"
                  variant="ghost"
                  onClick={() => void store.loadOlder()}
                >
                  {t("EntityTimeline.loadOlder")}
                </Button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
});
