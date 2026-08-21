"use client";

import type { MessagingProvider } from "@/generated/prisma";
import type { MessagingAttendee } from "@/ee/messaging/messaging.schema";

import { ChevronLeft, ExternalLink, Plus, Unlink, UserPlus } from "lucide-react";
import { useTranslations } from "next-intl";
import { observer } from "mobx-react-lite";

import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useNavigateToHref } from "@/components/entity-detail/hooks/use-entity-drawer-stack";
import { useRootStore } from "@/core/stores/root-store.provider";
import { displayableIdentifier, isAttendeeUnlinked, participantLabel } from "@/ee/messaging/thread-display";
import { SelectionOptionsSkeleton } from "@/components/forms/selection-loading";
import { runUserAction } from "@/core/errors/report-application-error";

type ManagerProps = {
  participants: MessagingAttendee[];
  provider: MessagingProvider;
  canManage: boolean;
};

export const ThreadPeopleManager = observer(({ participants, provider, canManage }: ManagerProps) => {
  const t = useTranslations();
  const navigateToHref = useNavigateToHref();
  const { threadParticipantsStore: store } = useRootStore();

  if (store.isSearching && store.activeIdentifier) {
    const activeIdentifier = store.activeIdentifier;
    const active = participants.find((p) => p.identifier === activeIdentifier) ?? null;
    const activeLabel = active ? participantLabel(active, provider, t("Inbox.senderUnknown")) : "";
    const trimmedSuggestion = activeLabel.trim();
    const showSuggestedCreate =
      !store.isLoading && !store.searchError && store.query.trim().length === 0 && trimmedSuggestion.length > 0;

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
              if (store.showCreate) {
                e.preventDefault();
                runUserAction(() => store.createAndAssign(activeIdentifier, store.query));
              } else if (showSuggestedCreate) {
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
                <CommandItem
                  disabled={store.pending}
                  value="__create__"
                  onSelect={() =>
                    runUserAction(() =>
                      store.createAndAssign(activeIdentifier, showSuggestedCreate ? trimmedSuggestion : store.query),
                    )
                  }
                >
                  <Plus className="size-3.5" />

                  <span>
                    {t("Inbox.compose.createContact", {
                      query: showSuggestedCreate ? trimmedSuggestion : store.query.trim(),
                    })}
                  </span>
                </CommandItem>
              </CommandGroup>
            )}

            {!store.isLoading && store.results.length > 0 && (
              <CommandGroup>
                {store.results.map((c) => {
                  const label = `${c.firstName} ${c.lastName}`.trim() || t("Inbox.compose.unnamed");
                  return (
                    <CommandItem
                      key={c.id}
                      disabled={store.pending}
                      value={c.id}
                      onSelect={() => runUserAction(() => store.link(activeIdentifier, c.id))}
                    >
                      <Avatar name={label} size="sm" src={c.avatarUrl ?? undefined} />

                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm">{label}</div>
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
        const matched = p.contact ?? null;
        const label = participantLabel(p, provider, t("Inbox.senderUnknown"));
        const subtitle = displayableIdentifier(provider, p.identifier);
        const avatarUrl = matched?.avatarUrl ?? p.pictureUrl ?? undefined;

        return (
          <div key={p.identifier} className="flex items-center gap-2 py-2">
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

            {matched ? (
              <div className="flex shrink-0 items-center gap-2">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      aria-label={t("Inbox.participants.openContact")}
                      className="size-7 text-muted-foreground"
                      size="icon-sm"
                      type="button"
                      variant="ghost"
                      onClick={() => navigateToHref(`/contacts/${matched.id}`)}
                    >
                      <ExternalLink className="size-3.5" />
                    </Button>
                  </TooltipTrigger>

                  <TooltipContent>{t("Inbox.participants.openContact")}</TooltipContent>
                </Tooltip>

                {canManage && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        aria-label={t("Inbox.participants.unlink")}
                        className="size-7"
                        data-size="icon-sm"
                        disabled={store.pending}
                        type="button"
                        variant="softDestructive"
                        onClick={() => runUserAction(() => store.unlink(p.identifier))}
                      >
                        <Unlink className="size-3.5" />
                      </Button>
                    </TooltipTrigger>

                    <TooltipContent>{t("Inbox.participants.unlink")}</TooltipContent>
                  </Tooltip>
                )}
              </div>
            ) : (
              canManage && (
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
              )
            )}
          </div>
        );
      })}
    </div>
  );
});
