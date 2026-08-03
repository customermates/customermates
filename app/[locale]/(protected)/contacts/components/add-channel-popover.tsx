"use client";

import { useEffect } from "react";
import { observer } from "mobx-react-lite";
import { useTranslations } from "next-intl";
import { Plus, Search } from "lucide-react";

import type { MessagingProvider } from "@/generated/prisma";

import { CommandEmpty, CommandGroup, CommandItem, CommandList, CommandPrimitive } from "@/components/ui/command";
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover";
import { getProviderIcon } from "@/ee/messaging/provider-icon";
import { channelDisplayLabel } from "@/ee/messaging/thread-display";
import { useRootStore } from "@/core/stores/root-store.provider";

const SOURCE_HINT_KEYS = {
  conversation: "EntityChannels.addChannel.sourceConversations",
  contact: "EntityChannels.addChannel.sourceContacts",
  lookup: "EntityChannels.addChannel.sourceLookup",
} as const;

export const AddChannelPopover = observer(({ contactId }: { contactId: string }) => {
  const t = useTranslations();
  const { addChannelStore: store } = useRootStore();

  useEffect(() => {
    store.setContactId(contactId);
    store.reset();
  }, [store, contactId]);

  const candidates = store.mergedCandidates;
  const addAsNewOptions = store.addAsNewOptions;
  const value = store.query.trim();
  const busy = store.isSearching || store.isResolving;
  const hasResults = candidates.length > 0 || addAsNewOptions.length > 0;
  const showList = store.open && (busy || hasResults || value.length >= 2);
  const showEmpty = !busy && value.length >= 2 && !hasResults;

  const providerLabel = (provider: MessagingProvider) => t(`Common.providers.${provider}`);

  return (
    <CommandPrimitive className="relative" shouldFilter={false}>
      <Popover open={showList} onOpenChange={(next) => store.setOpen(next)}>
        <PopoverAnchor asChild>
          <div className="border-border bg-card focus-within:border-ring focus-within:ring-ring/50 flex w-full items-center gap-3 rounded-md border px-3 py-2 shadow-xs transition-[color,box-shadow] focus-within:ring-[3px] focus-within:ring-inset">
            <Search aria-hidden className="text-muted-foreground size-5 shrink-0" />

            <CommandPrimitive.Input
              aria-label={t("EntityChannels.addChannel.trigger")}
              className="placeholder:text-muted-foreground flex-1 bg-transparent text-sm outline-none"
              placeholder={t("EntityChannels.addChannel.searchPlaceholder")}
              value={store.query}
              onClick={() => store.setOpen(true)}
              onFocus={() => store.setOpen(true)}
              onKeyDown={(event) => {
                if (event.key === "Escape") {
                  store.setOpen(false);
                  event.currentTarget.blur();
                } else if (event.key === "Tab") store.setOpen(false);
              }}
              onValueChange={(next) => {
                store.setOpen(true);
                store.setQuery(next);
              }}
            />
          </div>
        </PopoverAnchor>

        <PopoverContent
          align="start"
          className="w-(--radix-popover-trigger-width) overflow-hidden p-0"
          onOpenAutoFocus={(event) => event.preventDefault()}
        >
          <CommandList>
            {busy && candidates.length === 0 && (
              <div className="text-muted-foreground py-3 text-center text-sm">
                {t("EntityChannels.addChannel.searching")}
              </div>
            )}

            {showEmpty && <CommandEmpty>{t("EntityChannels.addChannel.noResults")}</CommandEmpty>}

            {candidates.length > 0 && (
              <CommandGroup>
                {candidates.map(({ candidate, source }) => {
                  const ProviderIcon = getProviderIcon(candidate.provider);
                  const channelLabel = channelDisplayLabel(candidate.provider, candidate.value, candidate.profileUrl);
                  const primary = candidate.displayName || channelLabel;
                  const showLabel = Boolean(
                    candidate.displayName && channelLabel && channelLabel !== candidate.displayName,
                  );
                  return (
                    <CommandItem
                      key={`${candidate.provider}:${candidate.value}`}
                      value={`${candidate.provider}:${candidate.value}`}
                      onSelect={() => void store.selectCandidate(candidate)}
                    >
                      <ProviderIcon className="size-5 shrink-0" />

                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{primary}</p>

                        <p className="text-muted-foreground truncate text-xs">
                          {showLabel ? channelLabel : t(SOURCE_HINT_KEYS[source])}
                        </p>
                      </div>
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            )}

            {addAsNewOptions.length === 1 && (
              <CommandGroup>
                <CommandItem
                  key={`add:${addAsNewOptions[0]}`}
                  value={`add:${addAsNewOptions[0]}`}
                  onSelect={() => void store.addAsNew(addAsNewOptions[0])}
                >
                  <Plus className="size-5 shrink-0" />

                  <span className="min-w-0 flex-1 truncate text-sm">
                    {t("EntityChannels.addChannel.addAs", { value, provider: providerLabel(addAsNewOptions[0]) })}
                  </span>
                </CommandItem>
              </CommandGroup>
            )}

            {addAsNewOptions.length > 1 && (
              <div className="border-border flex items-center gap-2 border-t px-3 py-2">
                <span className="text-muted-foreground shrink-0 text-xs">
                  {t("EntityChannels.addChannel.addAsLabel")}
                </span>

                <div className="flex items-center gap-1">
                  {addAsNewOptions.map((provider) => {
                    const ProviderIcon = getProviderIcon(provider);
                    return (
                      <button
                        key={provider}
                        aria-label={providerLabel(provider)}
                        className="hover:bg-accent flex size-8 items-center justify-center rounded-md transition-[background-color,transform] active:scale-[0.97] motion-reduce:transition-none"
                        type="button"
                        onClick={() => void store.addAsNew(provider)}
                      >
                        <ProviderIcon className="size-5" />
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </CommandList>
        </PopoverContent>
      </Popover>
    </CommandPrimitive>
  );
});
