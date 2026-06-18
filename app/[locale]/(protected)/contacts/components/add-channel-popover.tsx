"use client";

import { useEffect } from "react";
import { observer } from "mobx-react-lite";
import { useTranslations } from "next-intl";
import { ChevronLeft, Loader2, Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { AppForm } from "@/components/forms/form-context";
import { FormInput } from "@/components/forms/form-input";
import { FormSelect } from "@/components/forms/form-select";
import { iconButtonClass, iconButtonIconClass } from "@/components/ui/icon-button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { MANUAL_CHANNEL_PROVIDERS, getProviderIcon } from "@/ee/messaging/provider-icon";
import { channelDisplayLabel } from "@/ee/messaging/thread-display";
import { useRootStore } from "@/core/stores/root-store.provider";
import { cn } from "@/lib/utils";

export const AddChannelPopover = observer(({ contactId }: { contactId: string }) => {
  const t = useTranslations();
  const { addChannelStore: store } = useRootStore();

  useEffect(() => {
    store.setContactId(contactId);
    store.reset();
  }, [store, contactId]);

  const showFooterDivider = store.manualMode || store.isSearching || store.query.trim().length >= 2;

  return (
    <Popover open={store.open} onOpenChange={store.setOpen}>
      <Tooltip>
        <TooltipTrigger asChild>
          <PopoverTrigger aria-label={t("EntityChannels.addChannel.trigger")} className={iconButtonClass}>
            <Plus aria-hidden className={iconButtonIconClass} />
          </PopoverTrigger>
        </TooltipTrigger>

        <TooltipContent>{t("EntityChannels.addChannel.trigger")}</TooltipContent>
      </Tooltip>

      <PopoverContent align="start" className="flex w-80 flex-col overflow-hidden p-0">
        {store.manualMode ? (
          <AppForm className="flex flex-col gap-2 p-3" store={store}>
            <FormSelect
              id="provider"
              items={MANUAL_CHANNEL_PROVIDERS.map((p) => {
                const ProviderIcon = getProviderIcon(p);
                return {
                  value: p,
                  label: t(`Common.providers.${p}`),
                  startContent: <ProviderIcon className="size-4 shrink-0" />,
                };
              })}
              label={null}
              onValueChange={store.changeProvider}
            />

            <FormInput
              autoFocus
              id="value"
              label={null}
              placeholder={t(`EntityChannels.addChannel.placeholder.${store.form.provider}`)}
            />

            <Button className="self-end" disabled={store.isLoading} size="sm" type="submit">
              {store.isLoading && <Loader2 className="size-4 animate-spin" />}

              {t("EntityChannels.addChannel.add")}
            </Button>
          </AppForm>
        ) : (
          <Command className="rounded-none" shouldFilter={false}>
            <CommandInput
              autoFocus
              placeholder={t("EntityChannels.addChannel.searchPlaceholder")}
              value={store.query}
              onValueChange={store.setQuery}
            />

            <CommandList>
              {store.isSearching && (
                <div className="text-muted-foreground py-3 text-center text-sm">
                  {t("EntityChannels.addChannel.searching")}
                </div>
              )}

              {!store.isSearching && store.query.trim().length >= 2 && store.candidates.length === 0 && (
                <CommandEmpty>{t("EntityChannels.addChannel.noResults")}</CommandEmpty>
              )}

              {store.candidates.length > 0 && (
                <CommandGroup>
                  {store.candidates.map((candidate) => {
                    const ProviderIcon = getProviderIcon(candidate.provider);
                    const channelLabel = channelDisplayLabel(candidate.provider, candidate.value, candidate.profileUrl);
                    return (
                      <CommandItem
                        key={`${candidate.provider}:${candidate.value}`}
                        value={`${candidate.provider}:${candidate.value}`}
                        onSelect={() => void store.linkCandidate(candidate)}
                      >
                        <ProviderIcon className="size-5 shrink-0" />

                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium">{candidate.displayName ?? channelLabel}</p>

                          {channelLabel && channelLabel !== candidate.displayName && (
                            <p className="text-muted-foreground truncate text-xs">{channelLabel}</p>
                          )}
                        </div>
                      </CommandItem>
                    );
                  })}
                </CommandGroup>
              )}
            </CommandList>
          </Command>
        )}

        <div className={cn("flex items-center px-3 py-2", showFooterDivider && "border-border border-t")}>
          {store.manualMode ? (
            <button
              className="text-muted-foreground hover:text-foreground flex items-center gap-1.5 text-[11px] transition-colors"
              type="button"
              onClick={() => store.setManualMode(false)}
            >
              <ChevronLeft className="size-3.5" />

              {t("Common.actions.back")}
            </button>
          ) : (
            <button
              className="text-muted-foreground hover:text-foreground flex items-center gap-1.5 text-[11px] transition-colors"
              type="button"
              onClick={() => store.setManualMode(true)}
            >
              <Plus className="size-3.5" />

              {t("EntityChannels.addChannel.manualHeading")}
            </button>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
});
