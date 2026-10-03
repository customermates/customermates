"use client";

import { useTranslations } from "next-intl";

import type { RecordColumn } from "@/features/records/record-columns";
import type { RecordDto, RecordRef } from "@/features/records/record-model.schema";

import { AppChip } from "@/components/chip/app-chip";
import { AvatarStack } from "@/components/shared/avatar-stack";
import { useHydratedIntlStore } from "@/core/stores/use-hydrated-intl-store";
import { RecordValue } from "./record-value";
import { ChannelIconStack } from "@/components/shared/channel-icon-stack";
import { useCopyToClipboard } from "@/core/utils/use-copy-to-clipboard";
import { runUserAction } from "@/core/errors/report-application-error";
import { channelDisplayLabel } from "@/ee/messaging/thread-display";
import { Avatar } from "@/components/ui/avatar";

export function RecordCell({
  column,
  record,
  onOpen,
  onMore,
  relativeTimestamp = false,
  avatarFieldId,
}: {
  column: RecordColumn;
  record: RecordDto;
  onOpen: (ref: RecordRef) => void;
  onMore: () => void;
  relativeTimestamp?: boolean;
  avatarFieldId?: string;
}) {
  const t = useTranslations();
  const intl = useHydratedIntlStore();
  const copy = useCopyToClipboard();
  const empty = <span className="text-muted-foreground">—</span>;
  if (column.kind === "identity") {
    return record.identities?.length ? (
      <ChannelIconStack
        identifiers={record.identities}
        onItemClick={(item) =>
          runUserAction(() =>
            copy(channelDisplayLabel(item.provider, item.value, item.profileUrl) || item.displayName || item.value),
          )
        }
      />
    ) : (
      empty
    );
  }
  if (column.kind === "field") {
    const result = record.fields.find((value) => value.fieldId === column.field.id)?.result;
    if (avatarFieldId && result?.state === "value" && result.value.kind === "text") {
      const image = record.fields.find((field) => field.fieldId === avatarFieldId)?.result;
      return (
        <span className="flex min-w-0 items-center gap-2">
          <Avatar
            aria-hidden
            name={result.value.value}
            src={image?.state === "value" && image.value.kind === "text" ? image.value.value : null}
          />

          <RecordValue field={column.field} result={result} />
        </span>
      );
    }
    return <RecordValue field={column.field} result={result} />;
  }
  if (column.kind === "system") {
    if (column.id === "system:assignedTo")
      return record.assignedUsers.length ? <AvatarStack items={record.assignedUsers} size="sm" /> : empty;

    const instant = column.id === "system:createdAt" ? record.createdAt : record.updatedAt;
    return (
      <time dateTime={instant}>
        {relativeTimestamp
          ? intl.formatRelativeTime(new Date(instant))
          : intl.formatDescriptiveShortDateTime(new Date(instant))}
      </time>
    );
  }
  const summary =
    column.kind === "relationshipPath"
      ? record.relationshipPaths?.find((summary) => summary.pathId === column.definition.id)
      : record.relationships.find(
          (summary) => summary.relationId === column.relation.id && summary.direction === column.direction,
        );
  if (!summary?.records.length) return empty;
  return (
    <div className="flex flex-wrap items-center gap-1">
      {summary.records.map((related) => {
        const title =
          related.title.state === "value" && related.title.value.kind === "text"
            ? related.title.value.value
            : related.title.state === "restricted"
              ? t("RecordModel.restricted")
              : related.title.state === "error"
                ? t("RecordModel.calculationError")
                : t("RecordModel.record");
        return (
          <button
            key={`${related.ref.typeId}:${related.ref.recordId}`}
            aria-label={t("RecordModel.openRecord", { name: title })}
            className="max-w-full rounded-md text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            type="button"
            onClick={() => onOpen(related.ref)}
          >
            <AppChip interactive>{title}</AppChip>
          </button>
        );
      })}

      {summary.hasMore && (
        <button
          aria-label={t("RecordModel.linkedRecordCount", {
            count: summary.readableCount,
          })}
          className="rounded-md text-xs text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring"
          type="button"
          onClick={onMore}
        >
          +{summary.readableCount - summary.records.length}
        </button>
      )}
    </div>
  );
}
