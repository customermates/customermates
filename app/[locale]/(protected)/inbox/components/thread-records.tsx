"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { observer } from "mobx-react-lite";
import { ChevronsUpDown, Info, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AppChip } from "@/components/chip/app-chip";
import { RecordChipIcon } from "@/components/records/record-chip-icon";
import { Command, CommandEmpty, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverAnchor, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/core/utils/cn";
import {
  RECORD_LINK_FRAME_CLASS,
  RECORD_LINK_FRAME_READ_ONLY_CLASS,
} from "@/app/[locale]/(protected)/records/[typeId]/components/record-relationship-editor";
import { SelectionOptionsSkeleton } from "@/components/forms/selection-loading";
import { useRootStore } from "@/core/stores/root-store.provider";
import { runUserAction } from "@/core/errors/report-application-error";
import { recordSearchKey } from "@/features/records/record-search.schema";
import { recordDisplayName } from "@/features/records/record-display-name";
import { useFocusAfterRemoval } from "@/components/ui/use-focus-after-removal";
import { focusFirstControl } from "@/app/[locale]/(protected)/records/[typeId]/components/record-inline-field";
import { ThreadRecordsStore } from "./thread-records.store";

export const ThreadRecords = observer(({ threadId }: { threadId: string }) => {
  const t = useTranslations();
  const root = useRootStore();
  const [store] = useState(() => new ThreadRecordsStore(root));
  const list = useRef<HTMLDivElement>(null);
  const toggle = useRef<HTMLButtonElement>(null);
  const focusAfterRemoval = useFocusAfterRemoval();
  useEffect(() => {
    store.bind(threadId);
    return store.dispose;
  }, [store, threadId]);
  return (
    <section aria-label={t("Inbox.participants.conversationRecords")} className="flex flex-col gap-1.5">
      <div className="flex items-center gap-1">
        <h3 className="text-xs text-muted-foreground">{t("Inbox.participants.conversationRecords")}</h3>

        <Tooltip>
          <TooltipTrigger asChild>
            <button
              aria-label={t("Inbox.participants.conversationRecordsHint")}
              className="inline-flex size-4 items-center justify-center rounded-sm text-muted-foreground hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
              type="button"
            >
              <Info aria-hidden className="size-3" />
            </button>
          </TooltipTrigger>

          <TooltipContent className="max-w-64">{t("Inbox.participants.conversationRecordsHint")}</TooltipContent>
        </Tooltip>
      </div>

      {store.error && (
        <div className="flex items-center justify-between gap-2 text-sm" role="alert">
          <span>{t("Common.notifications.unexpectedError")}</span>

          <Button disabled={store.loading} size="sm" variant="secondary" onClick={() => runUserAction(store.reload)}>
            {t("ErrorCard.retry")}
          </Button>
        </div>
      )}

      <Popover open={store.searching} onOpenChange={store.setSearching}>
        <PopoverAnchor asChild>
          <div
            ref={list}
            className={cn(
              RECORD_LINK_FRAME_CLASS,
              RECORD_LINK_FRAME_READ_ONLY_CLASS,
              store.detail?.canManage && "pr-1",
            )}
            data-thread-records-field=""
          >
            {store.loading && !store.detail && <SelectionOptionsSkeleton label={t("Loading.text")} />}

            {!store.loading && !store.error && store.detail?.records.length === 0 && (
              <span className="text-muted-foreground">{t("Inbox.participants.noRecords")}</span>
            )}

            {store.detail?.records.map((record, index) => {
              const name = recordDisplayName(record.title, record.typeLabel, t);
              return (
                <AppChip
                  key={recordSearchKey(record)}
                  data-thread-record-chip=""
                  endContent={
                    record.canUnlink ? (
                      <button
                        aria-label={t("Inbox.participants.unlinkRecordNamed", { name })}
                        className="inline-flex size-5 items-center justify-center rounded-sm focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
                        disabled={store.pending}
                        type="button"
                        onClick={() =>
                          runUserAction(async () => {
                            await store.mutate("unlink", record.ref);
                            focusAfterRemoval({
                              container: () => list.current,
                              selector: "[data-thread-record-open]",
                              index,
                              fallback: () => toggle.current,
                            });
                          })
                        }
                      >
                        <X aria-hidden className="size-3" />
                      </button>
                    ) : undefined
                  }
                  startContent={
                    <RecordChipIcon
                      icons={{ [record.ref.typeId]: record.icon }}
                      pictureUrl={record.pictureUrl}
                      typeId={record.ref.typeId}
                    />
                  }
                >
                  <button
                    aria-label={t("Inbox.participants.openRecordNamed", { name })}
                    className="max-w-full rounded-sm text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    data-thread-record-open=""
                    type="button"
                    onClick={(event) => root.recordWorkspaceStore.open(record.ref, event.currentTarget)}
                  >
                    {name}
                  </button>
                </AppChip>
              );
            })}

            {store.detail?.canManage && (
              <PopoverTrigger asChild>
                <button
                  ref={toggle}
                  aria-label={t("Inbox.participants.linkRecord")}
                  className="ml-auto inline-flex size-7 shrink-0 items-center justify-center rounded-sm text-muted-foreground hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
                  type="button"
                >
                  <ChevronsUpDown aria-hidden className="size-3.5" />
                </button>
              </PopoverTrigger>
            )}
          </div>
        </PopoverAnchor>

        <PopoverContent
          align="start"
          className="w-72 p-0"
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            toggle.current?.focus({ preventScroll: true });
          }}
          onOpenAutoFocus={focusFirstControl}
        >
          <Command shouldFilter={false}>
            <CommandInput
              autoFocus
              disabled={store.pending}
              placeholder={t("Common.table.search")}
              value={store.query}
              onValueChange={store.setQuery}
            />

            <CommandList aria-busy={store.searchLoading || undefined}>
              {store.searchLoading && <SelectionOptionsSkeleton label={t("Loading.text")} />}

              {store.searchError && (
                <div className="flex items-center justify-between gap-2 p-2 text-sm" role="alert">
                  <span>{t("Common.notifications.unexpectedError")}</span>

                  <Button size="sm" variant="secondary" onClick={() => runUserAction(store.retryCurrent)}>
                    {t("ErrorCard.retry")}
                  </Button>
                </div>
              )}

              {!store.searchLoading && !store.searchError && <CommandEmpty>{t("GlobalSearch.noResults")}</CommandEmpty>}

              {!store.searchLoading &&
                store.results.map((record) => (
                  <CommandItem
                    key={recordSearchKey(record)}
                    disabled={store.pending}
                    value={recordSearchKey(record)}
                    onSelect={() => runUserAction(() => store.mutate("link", record.ref))}
                  >
                    <span className="min-w-0 flex-1 truncate">
                      {recordDisplayName(record.title, record.typeLabel, t)}
                    </span>

                    <span className="text-muted-foreground text-xs">{record.typePluralLabel}</span>
                  </CommandItem>
                ))}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </section>
  );
});
