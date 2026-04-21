"use client";

import type { AuditLogDto } from "@/ee/audit-log/get/get-audit-logs-by-entity-id.interactor";
import type { CustomColumnDto } from "@/features/custom-column/custom-column.schema";

import { ChevronDown, ChevronUp, Clock } from "lucide-react";
import { observer } from "mobx-react-lite";
import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";

import { processChanges } from "@/app/[locale]/(protected)/company/components/audit-log/entity-history-details.utils";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/shared/icon";
import { Spinner } from "@/components/ui/spinner";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { getEntityChangeHistoryByIdAction } from "@/app/actions";
import { useRootStore } from "@/core/stores/root-store.provider";
import { cn } from "@/lib/utils";

type Props = {
  entityId: string;
  refreshKey?: unknown;
};

type EventTone = "created" | "updated" | "deleted" | "other";

function getInitials(firstName: string, lastName: string) {
  return `${firstName?.[0] ?? ""}${lastName?.[0] ?? ""}`.toUpperCase();
}

function eventTone(event: string): EventTone {
  if (event.endsWith(".created")) return "created";
  if (event.endsWith(".updated")) return "updated";
  if (event.endsWith(".deleted")) return "deleted";
  return "other";
}

function toneRingClass(tone: EventTone) {
  if (tone === "created") return "outline outline-2 outline-success/60";
  if (tone === "deleted") return "outline outline-2 outline-destructive/60";
  if (tone === "updated") return "outline outline-2 outline-primary/60";
  return "";
}

const DEFAULT_VISIBLE_COUNT = 6;

export const EntityAuditLogPanel = observer(function EntityAuditLogPanel({ entityId, refreshKey }: Props) {
  const t = useTranslations("");
  const { entityHistoryDetailsModalStore, intlStore } = useRootStore();
  const [items, setItems] = useState<AuditLogDto[]>([]);
  const [customColumns, setCustomColumns] = useState<CustomColumnDto[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    setShowAll(false);
    void getEntityChangeHistoryByIdAction({ entityId }).then((result) => {
      if (cancelled) return;
      setItems(result.items);
      setCustomColumns(result.customColumns);
      setIsLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [entityId, refreshKey]);

  const customColumnsById = new Map(customColumns.map((c) => [c.id, c]));
  // Failsafe: `*.updated` events with zero field changes should never reach the
  // client (the backend suppresses them in EventService.publish), but if one
  // slips through, hide it here so the timeline doesn't show a "Task Updated"
  // row with no changes underneath.
  const processedItems = items
    .map((item) => ({ item, changes: processChanges(item, customColumnsById, t) }))
    .filter(({ item, changes }) => !item.event.endsWith(".updated") || changes.length > 0);
  const visibleItems = showAll ? processedItems : processedItems.slice(0, DEFAULT_VISIBLE_COUNT);
  const hasOverflow = processedItems.length > DEFAULT_VISIBLE_COUNT;

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center gap-2 px-4 pt-4 pb-1 shrink-0">
        <Icon className="size-3.5 text-muted-foreground" icon={Clock} />

        <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          {t("Common.actions.labelHistory")}
        </span>
      </div>

      <div className="flex-1 min-h-0 overflow-auto px-4 pt-2 pb-4">
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Spinner size="lg" />
          </div>
        ) : processedItems.length === 0 ? (
          <p className="text-subdued py-8 text-center text-x-sm">{t("AuditLogModal.emptyHistory")}</p>
        ) : (
          <TooltipProvider>
            <ol className="relative flex flex-col">
              {visibleItems.map(({ item, changes }, index) => {
                const tone = eventTone(item.event);
                const authorName = `${item.user.firstName} ${item.user.lastName}`.trim();
                const fieldPreview = changes
                  .slice(0, 3)
                  .map((c) => c.field)
                  .join(" · ");
                const extraCount = changes.length - 3;
                const isLast = index === visibleItems.length - 1;

                return (
                  <li key={item.id} className="relative flex gap-3 pb-4">
                    {!isLast && <span aria-hidden className="absolute left-[13px] top-8 bottom-0 w-px bg-border" />}

                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Avatar
                          className={cn(
                            "relative z-10 mt-0.5 shrink-0 size-[26px] ring-4 ring-background",
                            toneRingClass(tone),
                          )}
                        >
                          {item.user.avatarUrl && <AvatarImage alt={authorName} src={item.user.avatarUrl} />}

                          <AvatarFallback className="text-[10px] font-medium">
                            {getInitials(item.user.firstName, item.user.lastName)}
                          </AvatarFallback>
                        </Avatar>
                      </TooltipTrigger>

                      <TooltipContent>{authorName}</TooltipContent>
                    </Tooltip>

                    <button
                      className="flex-1 min-w-0 text-left rounded-md -mx-2 px-2 py-1.5 hover:bg-muted/40 transition-colors cursor-pointer"
                      type="button"
                      onClick={() => entityHistoryDetailsModalStore.openWithData(item, customColumns)}
                    >
                      <div className="flex items-start gap-2 min-w-0">
                        <span className="flex-1 text-sm font-medium text-foreground leading-snug">
                          {t(`Common.events.${item.event}`)}
                        </span>

                        <span className="text-[10px] text-muted-foreground whitespace-nowrap pt-0.5">
                          {intlStore.formatRelativeTime(new Date(item.createdAt))}
                        </span>
                      </div>

                      {fieldPreview && (
                        <div className="mt-0.5 text-xs text-muted-foreground truncate">
                          {fieldPreview}

                          {extraCount > 0 && <span className="ml-1">+{extraCount}</span>}
                        </div>
                      )}
                    </button>
                  </li>
                );
              })}
            </ol>

            {hasOverflow && (
              <div className="flex pt-1 -ml-3">
                <Button
                  className="text-xs text-muted-foreground"
                  size="sm"
                  type="button"
                  variant="ghost"
                  onClick={() => setShowAll((v) => !v)}
                >
                  <Icon icon={showAll ? ChevronUp : ChevronDown} />

                  {showAll ? t("Common.actions.showFewer") : t("Common.actions.showAll")}
                </Button>
              </div>
            )}
          </TooltipProvider>
        )}
      </div>
    </div>
  );
});
