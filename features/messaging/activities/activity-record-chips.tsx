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

export function ActivityRecordChips({ context }: { context: ActivityRecordContextDto }) {
  const t = useTranslations();
  const entityHref = useEntityHref();

  if (!context.primary) return null;

  const items = [context.primary, ...context.related].map((ref) => {
    const RecordIcon = ENTITY_ICON[ref.entityType];

    return {
      id: recordRefKey(ref.entityType, ref.id),
      entityType: ref.entityType,
      recordId: ref.id,
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
        <AppChipStack chipHref={(item) => entityHref(item.entityType, item.recordId)} items={items} size="sm" />
      </div>

      {context.relatedOverflow > 0 && (
        <AppChip className="shrink-0">{t("EntityTimeline.moreRecords", { count: context.relatedOverflow })}</AppChip>
      )}
    </div>
  );
}
