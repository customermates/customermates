"use client";

import { useTranslations } from "next-intl";

import type { RecordColumn } from "@/features/records/record-columns";
import type { RecordFieldView } from "@/features/records/record-model.schema";
import type { RecordDto, RecordRef } from "@/features/records/record-model.schema";
import type { RecordLinkColors, RecordLinkIcons } from "@/features/records/record-presentation";

import { AppChipStack } from "@/components/chip/app-chip-stack";
import { recordLinkColor } from "@/features/records/record-presentation";
import { MemberAvatar, memberName } from "@/components/chip/member-chip";
import { RecordChipIcon } from "@/components/records/record-chip-icon";
import { useHydratedIntlStore } from "@/core/stores/use-hydrated-intl-store";
import { RecordValue } from "./record-value";
import { Avatar } from "@/components/ui/avatar";

const LINKED_CHIPS_MAX_WIDTH = 240;

export function RecordCell({
  column,
  linkColors,
  linkIcons,
  record,
  onOpen,
  onMore,
  relativeTimestamp = false,
  avatarFieldId,
}: {
  column: RecordColumn<RecordFieldView>;
  linkColors: RecordLinkColors;
  linkIcons: RecordLinkIcons;
  record: RecordDto;
  onOpen: (ref: RecordRef) => void;
  onMore: () => void;
  relativeTimestamp?: boolean;
  avatarFieldId?: string;
}) {
  const t = useTranslations();
  const intl = useHydratedIntlStore();
  const empty = <span className="text-muted-foreground">—</span>;
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

          <RecordValue
            field={column.field}
            identities={record.identities}
            members={record.memberUsers}
            result={result}
          />
        </span>
      );
    }
    return (
      <RecordValue field={column.field} identities={record.identities} members={record.memberUsers} result={result} />
    );
  }
  if (column.kind === "system") {
    if (column.id === "system:assignedTo") {
      return record.assignedUsers.length ? (
        <AppChipStack
          items={record.assignedUsers.map((member) => ({
            id: member.id,
            label: memberName(member),
            startContent: <MemberAvatar member={member} />,
          }))}
          maxWidth={LINKED_CHIPS_MAX_WIDTH}
        />
      ) : (
        empty
      );
    }

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
  const items = summary.records.map((related) => ({
    id: `${related.ref.typeId}:${related.ref.recordId}`,
    ref: related.ref,
    startContent: <RecordChipIcon icons={linkIcons} typeId={related.ref.typeId} />,
    label:
      related.title.state === "value" && related.title.value.kind === "text"
        ? related.title.value.value
        : related.title.state === "restricted"
          ? t("RecordModel.restricted")
          : related.title.state === "error"
            ? t("RecordModel.calculationError")
            : t("RecordModel.record"),
  }));
  return (
    <div className="flex min-w-0 items-center gap-1">
      <AppChipStack
        chipLabel={(item) => t("RecordModel.openRecord", { name: item.label })}
        items={items}
        maxWidth={LINKED_CHIPS_MAX_WIDTH}
        variant={recordLinkColor(linkColors, summary.records[0].ref.typeId)}
        onChipClick={(item) => onOpen(item.ref)}
      />

      {summary.hasMore && (
        <button
          aria-label={t("RecordModel.linkedRecordCount", {
            count: summary.readableCount,
          })}
          className="shrink-0 rounded-md text-xs text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring"
          type="button"
          onClick={onMore}
        >
          +{summary.readableCount - summary.records.length}
        </button>
      )}
    </div>
  );
}
