"use client";

import { useTranslations } from "next-intl";

import type { RecordColumn } from "@/features/records/record-columns";
import type { RecordFieldView } from "@/features/records/record-model.schema";
import type { RecordDto, RecordRef } from "@/features/records/record-model.schema";
import type { RecordLinkColors, RecordLinkIcons, RecordLinkLabels } from "@/features/records/record-presentation";

import { AppChipStack } from "@/components/chip/app-chip-stack";
import { recordLinkColor } from "@/features/records/record-presentation";
import { MemberAvatar, memberName } from "@/components/chip/member-chip";
import { RecordChipIcon } from "@/components/records/record-chip-icon";
import { useHydratedIntlStore } from "@/core/stores/use-hydrated-intl-store";
import { RecordValue } from "@/components/records/record-value";
import { EmptyValue } from "@/components/shared/empty-value";
import { Avatar } from "@/components/ui/avatar";
import { recordDisplayName } from "@/features/records/record-display-name";

const LINKED_CHIPS_MAX_WIDTH = 240;

export function RecordCell({
  column,
  linkColors,
  linkIcons,
  linkLabels,
  record,
  onOpen,
  onMore,
  inTrigger = false,
  relativeTimestamp = false,
  avatarFieldId,
  fallbackTitle,
}: {
  column?: RecordColumn<RecordFieldView>;
  linkColors: RecordLinkColors;
  linkIcons: RecordLinkIcons;
  linkLabels: RecordLinkLabels;
  record: RecordDto;
  onOpen: (ref: RecordRef) => void;
  onMore?: () => void;
  inTrigger?: boolean;
  relativeTimestamp?: boolean;
  avatarFieldId?: string;
  fallbackTitle?: string;
}) {
  const t = useTranslations();
  const intl = useHydratedIntlStore();
  const empty = <EmptyValue />;
  const field = column?.kind === "field" ? column.field : undefined;
  const result = field ? record.fields.find((value) => value.fieldId === field.id)?.result : undefined;
  if (!column || (avatarFieldId && result?.state === "value" && result.value.kind === "text")) {
    const name =
      result?.state === "value" && result.value.kind === "text"
        ? result.value.value
        : (fallbackTitle ?? recordDisplayName(undefined, undefined, t));
    const content = field ? (
      <RecordValue field={field} identities={record.identities} members={record.memberUsers} result={result} />
    ) : (
      <span className="truncate">{name}</span>
    );
    if (!avatarFieldId) return content;
    const image = record.fields.find((value) => value.fieldId === avatarFieldId)?.result;
    return (
      <span className="flex min-w-0 items-center gap-2">
        <Avatar
          aria-hidden
          name={name}
          src={image?.state === "value" && image.value.kind === "text" ? image.value.value : null}
        />

        {content}
      </span>
    );
  }
  if (column.kind === "field") {
    return (
      <RecordValue
        field={column.field}
        identities={record.identities}
        members={record.memberUsers}
        overflowMenu={!inTrigger}
        result={result}
      />
    );
  }
  if (column.kind === "system") {
    if (column.id === "system:assignedTo") {
      return record.assignedUsers.length ? (
        <AppChipStack
          fill
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
    label: recordDisplayName(related.title, linkLabels[related.ref.typeId], t),
  }));
  return (
    <AppChipStack
      fill
      chipLabel={(item) => t("RecordModel.openRecord", { name: item.label })}
      extraCount={summary.hasMore ? Math.max(0, summary.readableCount - summary.records.length) : 0}
      items={items}
      maxWidth={LINKED_CHIPS_MAX_WIDTH}
      overflowMenu={!inTrigger}
      variant={recordLinkColor(linkColors, summary.records[0].ref.typeId)}
      onChipClick={inTrigger ? undefined : (item) => onOpen(item.ref)}
      onMoreClick={inTrigger || !onMore ? undefined : onMore}
    />
  );
}
