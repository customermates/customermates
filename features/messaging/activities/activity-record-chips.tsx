"use client";

import type { ActivityRecordContextDto } from "@/ee/messaging/activities/activities.schema";

import { useTranslations } from "next-intl";
import { EntityType } from "@/features/records/history/v1/legacy-enums";

import { Avatar } from "@/components/ui/avatar";
import { AppChip } from "@/components/chip/app-chip";
import { AppChipStack } from "@/components/chip/app-chip-stack";
import { usePresetRecordHref } from "@/components/records/use-record-href";
import { useRootStore } from "@/core/stores/root-store.provider";
import { recordRefKey } from "@/ee/messaging/activities/activity-record-refs";
import { recordTypeIcon } from "@/components/records/record-type-icon";

export function ActivityRecordChips({ context }: { context: ActivityRecordContextDto }) {
  const t = useTranslations();
  const entityHref = usePresetRecordHref();
  const navigationTypes = useRootStore().recordWorkspaceStore.navigation?.types ?? [];

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
    const RecordIcon = recordTypeIcon(
      navigationTypes.find((type) => type.presetKey === ref.entityType)?.icon ?? "list",
    );

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
