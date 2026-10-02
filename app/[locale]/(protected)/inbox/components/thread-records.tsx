"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { observer } from "mobx-react-lite";
import { ChevronLeft, Plus, Unlink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Command, CommandEmpty, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { SelectionOptionsSkeleton } from "@/components/forms/selection-loading";
import { useRootStore } from "@/core/stores/root-store.provider";
import { runUserAction } from "@/core/errors/report-application-error";
import { recordSearchKey, recordSearchLabel } from "@/features/records/record-search.schema";
import { ThreadRecordsStore } from "./thread-records.store";

export const ThreadRecords = observer(({ threadId }: { threadId: string }) => {
  const t = useTranslations();
  const root = useRootStore();
  const [store] = useState(() => new ThreadRecordsStore(root));
  useEffect(() => {
    store.bind(threadId);
    return store.dispose;
  }, [store, threadId]);
  return (
    <section aria-label={t("Inbox.participants.conversationRecords")} className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-medium">{t("Inbox.participants.conversationRecords")}</h3>

        {store.detail?.canManage && (
          <Button
            disabled={store.pending}
            size="sm"
            type="button"
            variant="ghost"
            onClick={() => store.setSearching(!store.searching)}
          >
            {store.searching ? <ChevronLeft className="size-3.5" /> : <Plus className="size-3.5" />}

            {store.searching ? t("Common.actions.back") : t("Inbox.participants.linkRecord")}
          </Button>
        )}
      </div>

      <p className="text-muted-foreground text-xs">{t("Inbox.participants.conversationRecordsHint")}</p>

      {store.error && (
        <div className="flex items-center justify-between gap-2 text-sm" role="alert">
          <span>{t("Common.notifications.unexpectedError")}</span>

          <Button size="sm" variant="secondary" onClick={() => runUserAction(store.retryCurrent)}>
            {t("ErrorCard.retry")}
          </Button>
        </div>
      )}

      {store.searching ? (
        <Command className="border-border rounded-md border" shouldFilter={false}>
          <CommandInput
            autoFocus
            disabled={store.pending}
            placeholder={t("Common.table.search")}
            value={store.query}
            onValueChange={store.setQuery}
          />

          <CommandList aria-busy={store.loading || undefined}>
            {store.loading && <SelectionOptionsSkeleton label={t("Loading.text")} />}

            {!store.loading && !store.error && <CommandEmpty>{t("GlobalSearch.noResults")}</CommandEmpty>}

            {!store.loading &&
              store.results.map((record) => (
                <CommandItem
                  key={recordSearchKey(record)}
                  disabled={store.pending}
                  value={recordSearchKey(record)}
                  onSelect={() => runUserAction(() => store.mutate("link", record.ref))}
                >
                  <span className="min-w-0 flex-1 truncate">{recordSearchLabel(record, t)}</span>

                  <span className="text-muted-foreground text-xs">{record.typePluralLabel}</span>
                </CommandItem>
              ))}
          </CommandList>
        </Command>
      ) : (
        <div className="flex flex-col gap-1">
          {store.loading && !store.detail && <SelectionOptionsSkeleton label={t("Loading.text")} />}

          {!store.loading && !store.error && store.detail?.records.length === 0 && (
            <p className="text-muted-foreground text-xs">{t("Inbox.participants.noRecords")}</p>
          )}

          {!store.error &&
            store.detail?.records.map((record) => (
              <div key={recordSearchKey(record)} className="flex items-center gap-1">
                <Button
                  aria-label={`${t("Inbox.participants.openRecord")}: ${recordSearchLabel(record, t)}`}
                  className="min-w-0 flex-1 justify-start"
                  size="sm"
                  variant="secondary"
                  onClick={(event) => root.recordWorkspaceStore.open(record.ref, event.currentTarget)}
                >
                  <span className="truncate">{recordSearchLabel(record, t)}</span>

                  <span className="text-muted-foreground shrink-0 text-xs">· {record.typeLabel}</span>
                </Button>

                {record.canUnlink && (
                  <Button
                    aria-label={`${t("Inbox.participants.unlinkRecord")}: ${recordSearchLabel(record, t)}`}
                    disabled={store.pending}
                    size="icon-sm"
                    variant="ghost"
                    onClick={() => runUserAction(() => store.mutate("unlink", record.ref))}
                  >
                    <Unlink className="size-3.5" />
                  </Button>
                )}
              </div>
            ))}
        </div>
      )}
    </section>
  );
});
