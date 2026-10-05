"use client";

import type { ConfigureRailRow } from "./configure-model";

import { Archive, Plus, Search } from "lucide-react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { recordTypeIcon } from "@/components/records/record-type-icon";
import { cn } from "@/core/utils/cn";

type Props = {
  rows: ConfigureRailRow[];
  selectedId?: string;
  query: string;
  showArchived: boolean;
  hasArchived: boolean;
  canManage: boolean;
  disabled: boolean;
  hrefFor: (typeId: string) => string;
  onQuery: (query: string) => void;
  onToggleArchived: () => void;
  onSelect: (typeId: string) => void;
  onCreate: () => void;
};

export function ConfigureRail({
  rows,
  selectedId,
  query,
  showArchived,
  hasArchived,
  canManage,
  disabled,
  hrefFor,
  onQuery,
  onToggleArchived,
  onSelect,
  onCreate,
}: Props) {
  const t = useTranslations();
  return (
    <div className="flex min-h-0 flex-1 flex-col" data-configure-rail="">
      <div className="mx-3 mt-4 mb-3 flex items-center gap-1">
        <div className="relative min-w-0 flex-1">
          <Search
            aria-hidden="true"
            className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground"
          />

          <Input
            aria-label={t("RecordModel.searchLists")}
            className="h-8 pl-8"
            maxLength={200}
            placeholder={t("RecordModel.searchLists")}
            type="search"
            value={query}
            onChange={(event) => onQuery(event.target.value)}
          />
        </div>

        {hasArchived && (
          <Button
            aria-label={showArchived ? t("RecordModel.hideArchived") : t("RecordModel.showArchived")}
            aria-pressed={showArchived}
            className={cn(showArchived && "bg-accent text-accent-foreground")}
            size="icon-sm"
            title={showArchived ? t("RecordModel.hideArchived") : t("RecordModel.showArchived")}
            type="button"
            variant="ghost"
            onClick={onToggleArchived}
          >
            <Archive aria-hidden="true" />
          </Button>
        )}
      </div>

      <nav aria-label={t("RecordModel.lists")} className="min-h-0 flex-1 overflow-y-auto px-2 pb-3">
        <ul className="space-y-0.5">
          {rows.map(({ type, depth }) => {
            const Icon = recordTypeIcon(type.icon);
            const current = type.id === selectedId;
            const status = type.archived
              ? t("RecordModel.archived")
              : !type.embedded && !type.navigationVisible
                ? t("RecordModel.hiddenList")
                : null;
            return (
              <li key={type.id}>
                <Button
                  asChild
                  className={cn(
                    "h-auto min-h-9 w-full justify-start gap-2 p-2 text-left font-normal",
                    current && "bg-accent text-accent-foreground",
                    disabled && "pointer-events-none opacity-50",
                  )}
                  style={depth ? { paddingInlineStart: `${0.5 + depth * 1.25}rem` } : undefined}
                  variant="ghost"
                >
                  <a
                    data-navigation-guard-handled
                    aria-current={current ? "page" : undefined}
                    aria-disabled={disabled || undefined}
                    data-configure-list={type.id}
                    href={hrefFor(type.id)}
                    onClick={(event) => {
                      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0)
                        return;
                      event.preventDefault();
                      if (!disabled) onSelect(type.id);
                    }}
                  >
                    <Icon aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />

                    <span className="min-w-0 flex-1 truncate">{type.pluralLabel}</span>

                    {status && <span className="shrink-0 text-xs text-muted-foreground">{status}</span>}
                  </a>
                </Button>
              </li>
            );
          })}

          {rows.length === 0 && query.trim() !== "" && (
            <li className="p-2 text-sm text-muted-foreground">{t("RecordModel.noListsFound")}</li>
          )}

          {canManage && (
            <li>
              <Button
                className="h-auto min-h-9 w-full justify-start gap-2 p-2 font-normal text-muted-foreground"
                disabled={disabled}
                type="button"
                variant="ghost"
                onClick={onCreate}
              >
                <Plus aria-hidden="true" className="size-4 shrink-0" />

                {t("RecordModel.newList")}
              </Button>
            </li>
          )}
        </ul>
      </nav>
    </div>
  );
}
