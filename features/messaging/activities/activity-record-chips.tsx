"use client";

import type { ActivityRecordContextDto } from "@/ee/messaging/activities/activities.schema";

import { useTranslations } from "next-intl";

import { Avatar } from "@/components/ui/avatar";
import { AppChip } from "@/components/chip/app-chip";
import { AppChipStack } from "@/components/chip/app-chip-stack";
import { recordTypeIcon } from "@/components/records/record-type-icon";

export function ActivityRecordChips({ context }: { context: ActivityRecordContextDto }) {
  const t = useTranslations();

  if (!context.primary) return null;

  const items = [context.primary, ...context.related].map((ref) => {
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
