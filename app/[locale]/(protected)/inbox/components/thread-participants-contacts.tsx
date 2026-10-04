"use client";

import type { MessagingProvider } from "@/generated/prisma";
import type { MessagingAttendee } from "@/ee/messaging/messaging.schema";

import { ChevronLeft, Plus, Unlink, UserPlus } from "lucide-react";
import { useTranslations } from "next-intl";
import { observer } from "mobx-react-lite";

import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { RecordOperationProgress } from "@/components/records/record-operation-progress";
import { useRootStore } from "@/core/stores/root-store.provider";
import {
  displayableIdentifier,
  isAttendeeUnlinked,
  participantLabel,
  participantAvatar,
} from "@/ee/messaging/thread-display";
import { SelectionOptionsSkeleton } from "@/components/forms/selection-loading";
import { runUserAction } from "@/core/errors/report-application-error";

type ManagerProps = {
  participants: MessagingAttendee[];
  provider: MessagingProvider;
  canManage: boolean;
};

export const ThreadPeopleManager = observer(({ participants, provider, canManage }: ManagerProps) => {
  const t = useTranslations();
  const { threadParticipantsStore: store, recordWorkspaceStore } = useRootStore();

  if (store.pendingOperationId) {
    return (
      <RecordOperationProgress
        operationId={store.pendingOperationId}
        onCompleted={store.operationCompleted}
        onStopped={store.operationStopped}
      />
    );
  }

  if (store.isSearching && store.activeIdentifier) {
    const activeIdentifier = store.activeIdentifier;
    const active = participants.find((p) => p.identifier === activeIdentifier) ?? null;
    const activeLabel = active ? participantLabel(active, provider, t("Inbox.senderUnknown")) : "";
    const trimmedSuggestion = activeLabel.trim();
    const showSuggestedCreate =
      store.createTypes.length > 0 &&
      !store.isLoading &&
      !store.searchError &&
      store.query.trim().length === 0 &&
      trimmedSuggestion.length > 0 &&
      !store.results.some(
        (record) => record.title.trim().toLocaleLowerCase() === trimmedSuggestion.toLocaleLowerCase(),
      );

    return (
      <div className="border-border rounded-md border">
        <div className="border-border flex items-center gap-1.5 border-b px-2 py-1.5">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                aria-label={t("Common.actions.back")}
                className="size-7 shrink-0"
                data-size="icon-sm"
                type="button"
                variant="ghost"
                onClick={store.backToList}
              >
                <ChevronLeft className="size-4" />
              </Button>
            </TooltipTrigger>

            <TooltipContent>{t("Common.actions.back")}</TooltipContent>
          </Tooltip>

          <span className="truncate text-sm font-medium">{activeLabel}</span>
        </div>

        <Command shouldFilter={false}>
          <CommandInput
            autoFocus
            placeholder={t("Common.table.search")}
            value={store.query}
            onKeyDown={(e) => {
              if (e.key !== "Enter") return;
              if (store.isLoading || store.searchError || store.pending) return;
              if (store.showCreate && store.createTypes.length === 1) {
                e.preventDefault();
                runUserAction(() => store.createAndAssign(activeIdentifier, store.query));
              } else if (showSuggestedCreate && store.createTypes.length === 1) {
                e.preventDefault();
                runUserAction(() => store.createAndAssign(activeIdentifier, trimmedSuggestion));
              }
            }}
            onValueChange={store.setQuery}
          />

          <CommandList aria-busy={store.isLoading || undefined}>
            {store.isLoading && <SelectionOptionsSkeleton label={t("Loading.text")} />}

            {!store.isLoading && store.searchError && (
              <div className="flex flex-col items-center gap-2 px-3 py-4 text-center text-sm" role="alert">
                <span className="text-muted-foreground">{t("Common.notifications.unexpectedError")}</span>

                <Button
                  size="sm"
                  type="button"
                  variant="secondary"
                  onClick={() => runUserAction(() => store.retrySearch())}
                >
                  {t("ErrorCard.retry")}
                </Button>
              </div>
            )}

            {!store.isLoading &&
              !store.searchError &&
              store.results.length === 0 &&
              !store.showCreate &&
              !showSuggestedCreate && <CommandEmpty>{t("Inbox.compose.noContacts")}</CommandEmpty>}

            {!store.isLoading && (showSuggestedCreate || store.showCreate) && (
              <CommandGroup>
                {store.createTypes.map((type) => (
                  <CommandItem
                    key={type.typeId}
                    disabled={store.pending}
                    value={`__create__${type.typeId}`}
                    onSelect={() =>
                      runUserAction(() =>
                        store.createAndAssign(
                          activeIdentifier,
                          showSuggestedCreate ? trimmedSuggestion : store.query,
                          type.typeId,
                        ),
                      )
                    }
                  >
                    <Plus className="size-3.5" />

                    <span>
                      {t("Inbox.compose.createContact", {
                        query: showSuggestedCreate ? trimmedSuggestion : store.query.trim(),
                      })}

                      {store.createTypes.length > 1 ? ` · ${type.label}` : ""}
                    </span>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}

            {!store.isLoading && store.results.length > 0 && (
              <CommandGroup>
                {store.results.map((c) => {
                  const label = c.title.trim() || t("Inbox.compose.unnamed");
                  return (
                    <CommandItem
                      key={`${c.ref.typeId}:${c.ref.recordId}`}
                      aria-label={label}
                      disabled={store.pending || !c.canEdit}
                      value={`${c.ref.typeId}:${c.ref.recordId}`}
                      onSelect={() => runUserAction(() => store.link(activeIdentifier, c.ref))}
                    >
                      <Avatar name={label} size="sm" src={c.avatarUrl ?? undefined} />

                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm">{label}</div>

                        <div className="text-muted-foreground truncate text-xs">{c.typePluralLabel}</div>
                      </div>
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            )}
          </CommandList>
        </Command>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1">
      {participants.map((p) => {
        const matches = p.records;
        const label = participantLabel(p, provider, t("Inbox.senderUnknown"));
        const subtitle = displayableIdentifier(provider, p.identifier);
        const avatarUrl = participantAvatar(p) ?? undefined;

        return (
          <div key={p.identifier} className="flex flex-col gap-2 py-2">
            <div className="flex min-w-0 flex-1 items-center gap-3">
              <Avatar
                name={label}
                size="lg"
                src={avatarUrl}
                unlinked={isAttendeeUnlinked(p)}
                unlinkedLabel={t("Inbox.unlinkedParticipants")}
              />

              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium">{label}</div>

                {subtitle && subtitle !== label && (
                  <div className="text-muted-foreground truncate text-xs">{subtitle}</div>
                )}
              </div>
            </div>

            <div className="flex min-w-0 flex-col items-start gap-1 pl-11">
              {matches.map((record) => (
                <div key={`${record.ref.typeId}:${record.ref.recordId}`} className="flex w-full items-center gap-1">
                  <Button
                    aria-label={t("Inbox.participants.openRecordNamed", { name: record.title })}
                    className="h-7 min-w-0 flex-1 justify-start gap-1 px-2 text-xs"
                    type="button"
                    variant="secondary"
                    onClick={(event) => recordWorkspaceStore.open(record.ref, event.currentTarget)}
                  >
                    <span className="truncate">{record.title || record.typeLabel}</span>

                    <span className="text-muted-foreground shrink-0">· {record.typeLabel}</span>
                  </Button>

                  {canManage && record.canEdit && (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          aria-label={t("Inbox.participants.unlinkRecordNamed", { name: record.title })}
                          className="size-7"
                          disabled={store.pending}
                          size="icon-sm"
                          type="button"
                          variant="ghost"
                          onClick={() => runUserAction(() => store.unlink(p.identifier, record.ref))}
                        >
                          <Unlink className="size-3.5" />
                        </Button>
                      </TooltipTrigger>

                      <TooltipContent>{t("Inbox.participants.unlinkRecord")}</TooltipContent>
                    </Tooltip>
                  )}
                </div>
              ))}

              {canManage && (
                <Button
                  className="h-7 shrink-0 gap-1.5 px-2"
                  disabled={store.pending}
                  type="button"
                  variant="softPrimary"
                  onClick={() => store.startLink(p.identifier)}
                >
                  <UserPlus className="size-3.5" />

                  <span className="text-xs">{t("Inbox.participants.link")}</span>
                </Button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
});
