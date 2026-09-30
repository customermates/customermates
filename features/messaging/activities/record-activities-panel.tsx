"use client";

import { runUserAction } from "@/core/errors/report-application-error";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Filter } from "lucide-react";
import type { RecordRef } from "@/features/records/record-model.schema";
import type { ActivityKind } from "@/ee/messaging/activities/activities.schema";
import { ACTIVITY_KINDS } from "@/ee/messaging/activities/activities.schema";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuCheckboxItem,
} from "@/components/ui/dropdown-menu";
import { ActivitiesList, TimelineEmptyState, TimelineNotice } from "./activities-list";
import { ActivityTimelineSkeleton } from "./activity-timeline-skeleton";
import { useRecordActivities } from "./use-record-activities";

export function RecordActivitiesPanel({ record }: { record: RecordRef }) {
  const t = useTranslations();
  const [kinds, setKinds] = useState<ActivityKind[]>([...ACTIVITY_KINDS]);
  const { items, available, loading, loaded, error, hasMore, load } = useRecordActivities({
    scope: { records: [record], typeIds: [] },
    kinds,
  });
  const kindLabel = (kind: ActivityKind) =>
    t(
      kind === "audit"
        ? "EntityTimeline.types.changes"
        : kind === "message"
          ? "EntityTimeline.types.messages"
          : kind === "calendar_event"
            ? "ContactHistory.calendarMeeting"
            : "EntityTimeline.types.activities",
    );
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs text-muted-foreground">{t("Common.actions.labelHistory")}</span>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button aria-label={t("Common.filters.palette.title")} size="sm" type="button" variant="ghost">
              <Filter className="size-4" />
            </Button>
          </DropdownMenuTrigger>

          <DropdownMenuContent align="end">
            {available.map((kind) => (
              <DropdownMenuCheckboxItem
                key={kind}
                checked={kinds.includes(kind)}
                onCheckedChange={(checked) =>
                  setKinds((current) =>
                    checked
                      ? [...new Set([...current, kind])]
                      : current.length > 1
                        ? current.filter((value) => value !== kind)
                        : current,
                  )
                }
              >
                {kindLabel(kind)}
              </DropdownMenuCheckboxItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {error && (
        <div className="space-y-2" role="status">
          <TimelineNotice label={t("EntityTimeline.error")} />

          <Button size="sm" type="button" variant="secondary" onClick={() => runUserAction(() => load())}>
            {t("ErrorCard.retry")}
          </Button>
        </div>
      )}

      {!loaded && loading ? (
        <ActivityTimelineSkeleton />
      ) : items.length ? (
        <ActivitiesList
          customColumns={[]}
          hasMore={hasMore}
          items={items}
          loading={loading}
          onLoadOlder={() => runUserAction(() => load(true))}
        />
      ) : (
        !error && <TimelineEmptyState label={t("ContactHistory.noActivity")} />
      )}
    </div>
  );
}
