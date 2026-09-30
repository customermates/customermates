"use client";

import type { ActivityRecordContextDto } from "@/ee/messaging/activities/activities.schema";

import { useTranslations } from "next-intl";
import { EntityType } from "@/generated/prisma";

import { Avatar } from "@/components/ui/avatar";
import { AppChip } from "@/components/chip/app-chip";
import { AppChipStack } from "@/components/chip/app-chip-stack";
import { ENTITY_ICON } from "@/components/entity-detail/entity-relations";
import { useEntityHref } from "@/components/entity-detail/hooks/use-entity-drawer-stack";
import { recordRefKey } from "@/ee/messaging/activities/activity-record-refs";
import { recordTypeIcon } from "@/components/records/record-type-icon";

export function ActivityRecordChips({ context }: { context: ActivityRecordContextDto }) {
  const t = useTranslations();
  const entityHref = useEntityHref();

  if (!context.primary) return null;

  const items = [context.primary, ...context.related].map((ref) => {
    if ("ref" in ref) {
      const RecordIcon = recordTypeIcon(ref.icon);
      return {
        id: `${ref.ref.typeId}:${ref.ref.recordId}`,
        href: `/records/${ref.ref.typeId}/${ref.ref.recordId}`,
        label: ref.label,
        startContent: ref.avatarUrl ? (
          <Avatar name={ref.label} size="sm" src={ref.avatarUrl} />
        ) : (
          <RecordIcon aria-hidden className="shrink-0" />
        ),
      };
    }
    const RecordIcon = ENTITY_ICON[ref.entityType];

    return {
      id: recordRefKey(ref.entityType, ref.id),
      href: entityHref(ref.entityType, ref.id),
      label: ref.label,
      startContent:
        ref.entityType === EntityType.contact ? (
          <Avatar name={ref.label} size="sm" src={ref.avatarUrl} />
        ) : (
          <RecordIcon aria-hidden className="shrink-0" />
        ),
    };
  });

  return (
    <div className="flex min-w-0 items-center gap-1.5">
      <div className="min-w-0 flex-1">
        <AppChipStack chipHref={(item) => item.href} items={items} size="sm" />
      </div>

      {context.relatedOverflow > 0 && (
        <AppChip className="shrink-0">{t("EntityTimeline.moreRecords", { count: context.relatedOverflow })}</AppChip>
      )}
    </div>
  );
}
