"use client";

import type { MessagingProvider } from "@/generated/prisma";
import type { MessagingAttendee } from "@/ee/messaging/messaging.schema";

import { Plus, UserPlus, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { observer } from "mobx-react-lite";

import { AppChip } from "@/components/chip/app-chip";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
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
import { focusFirstControl } from "@/app/[locale]/(protected)/records/[typeId]/components/record-inline-field";
import { CopyableAddress } from "./copyable-address";

type ManagerProps = {
  participants: MessagingAttendee[];
  provider: MessagingProvider;
  canManage: boolean;
};

const ParticipantLinkSearch = observer(
  ({
    participants,
    provider,
    activeIdentifier,
  }: {
    participants: MessagingAttendee[];
    provider: MessagingProvider;
    activeIdentifier: string;
  }) => {
    const t = useTranslations();
    const { threadParticipantsStore: store } = useRootStore();
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
    );
  },
);

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

  return (
    <div className="flex flex-col">
      {participants.map((p) => {
        const label = participantLabel(p, provider, t("Inbox.senderUnknown"));
        const subtitle = displayableIdentifier(provider, p.identifier);
        const searching = store.activeIdentifier === p.identifier;

        return (
          <div key={p.identifier} className="flex min-w-0 items-center gap-3 py-1.5">
            <Avatar
              name={label}
              src={participantAvatar(p) ?? undefined}
              unlinked={isAttendeeUnlinked(p)}
              unlinkedLabel={t("Inbox.unlinkedParticipants")}
            />

            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium">{label}</div>

              {subtitle && <CopyableAddress className="max-w-full text-xs text-muted-foreground" value={subtitle} />}
            </div>

            <div className="flex max-w-1/2 min-w-0 shrink-0 flex-wrap items-center justify-end gap-1">
              {p.records.map((record) => {
                const title = record.title || record.typeLabel;
                return (
                  <AppChip
                    key={`${record.ref.typeId}:${record.ref.recordId}`}
                    interactive
                    endContent={
                      canManage && record.canEdit ? (
                        <button
                          aria-label={t("Inbox.participants.unlinkRecordNamed", { name: title })}
                          className="inline-flex size-4 items-center justify-center rounded-sm text-muted-foreground hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
                          disabled={store.pending}
                          type="button"
                          onClick={() => runUserAction(() => store.unlink(p.identifier, record.ref))}
                        >
                          <X aria-hidden className="size-3" />
                        </button>
                      ) : undefined
                    }
                    startContent={<Avatar aria-hidden name={title} size="sm" src={record.avatarUrl} />}
                    tooltip={record.typeLabel}
                  >
                    <button
                      aria-label={t("Inbox.participants.openRecordNamed", { name: title })}
                      className="max-w-40 truncate rounded-sm text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      type="button"
                      onClick={(event) => recordWorkspaceStore.open(record.ref, event.currentTarget)}
                    >
                      {title}
                    </button>
                  </AppChip>
                );
              })}

              {canManage && (
                <Popover
                  open={searching}
                  onOpenChange={(open) => (open ? store.startLink(p.identifier) : store.backToList())}
                >
                  <PopoverTrigger asChild>
                    <Button
                      aria-label={t("Inbox.participants.link")}
                      className="h-6 gap-1 px-1.5 text-xs text-muted-foreground"
                      size="sm"
                      type="button"
                      variant="ghost"
                    >
                      <UserPlus aria-hidden className="size-3.5" />

                      {p.records.length === 0 && t("Inbox.participants.link")}
                    </Button>
                  </PopoverTrigger>

                  <PopoverContent align="end" className="w-72 p-0" onOpenAutoFocus={focusFirstControl}>
                    {searching && (
                      <ParticipantLinkSearch
                        activeIdentifier={p.identifier}
                        participants={participants}
                        provider={provider}
                      />
                    )}
                  </PopoverContent>
                </Popover>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
});
