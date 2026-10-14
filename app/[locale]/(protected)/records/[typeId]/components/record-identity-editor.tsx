"use client";

import { useEffect, useRef, useState } from "react";
import { observer } from "mobx-react-lite";
import { useTranslations } from "next-intl";
import { Plus, Search } from "lucide-react";

import type { MessagingProvider } from "@/generated/prisma";

import {
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandList,
  CommandPrimitive,
  useCommandInputAria,
} from "@/components/ui/command";
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { getProviderIcon } from "@/ee/messaging/provider-icon";
import { channelDisplayLabel } from "@/ee/messaging/thread-display";
import { RecordChannelStore } from "./record-channel.store";
import type { RecordEditorStore } from "./record-editor.store";
import type { RecordFieldView } from "@/features/records/record-model.schema";
import { RecordChannels } from "./record-channels";
import { EntityDetailField } from "@/components/entity-detail/entity-detail-field";
import { EntityDetailFieldActions } from "@/components/entity-detail/entity-detail-field-actions";
import { EntityDetailFieldDragHandle } from "@/components/entity-detail/entity-detail-fields";
import { channelLabelKey } from "@/ee/messaging/provider";
import { SelectionOptionsSkeleton } from "@/components/forms/selection-loading";
import { runUserAction } from "@/core/errors/report-application-error";
import { useClientReady } from "@/hooks/use-client-ready";
import { encodeGetParams } from "@/core/utils/get-params";
import { FilterFieldKey } from "@/core/types/filter-field-key";
import { FilterOperatorKey } from "@/core/base/base-query-builder";
import { recordReferenceKey } from "@/features/records/record-reference-key";

const SOURCE_HINT_KEYS = {
  conversation: "EntityChannels.addChannel.sourceConversations",
  lookup: "EntityChannels.addChannel.sourceLookup",
} as const;

const AddChannelSearchField = observer(
  ({ store, expanded, disabled }: { store: RecordChannelStore; expanded: boolean; disabled: boolean }) => {
    const t = useTranslations();
    const fieldRef = useRef<HTMLDivElement>(null);
    const ready = useClientReady();
    useCommandInputAria(fieldRef, expanded);

    return (
      <PopoverAnchor asChild>
        <div
          ref={fieldRef}
          className="border-input bg-input-background focus-within:border-ring focus-within:ring-ring/50 flex w-full items-center gap-3 rounded-md border px-3 py-2 shadow-xs transition-[color,box-shadow] focus-within:ring-[3px] focus-within:ring-inset"
        >
          <Search aria-hidden className="text-muted-foreground size-5 shrink-0" />

          <CommandPrimitive.Input
            aria-label={t("EntityChannels.addChannel.trigger")}
            className="placeholder:text-muted-foreground flex-1 bg-transparent text-sm outline-none"
            disabled={disabled || !ready}
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
    );
  },
);

export const RecordChannelPopover = observer(({ editor }: { editor: RecordEditorStore }) => {
  const t = useTranslations();
  const [store] = useState(() => new RecordChannelStore(editor));

  useEffect(() => {
    store.reset();
    return () => store.reset();
  }, [store, editor.presentation.typeId, editor.form.id]);

  const candidates = store.mergedCandidates;
  const addAsNewOptions = store.addAsNewOptions;
  const value = store.query.trim();
  const busy = store.isSearching || store.isResolving;
  const hasResults = candidates.length > 0 || addAsNewOptions.length > 0;
  const showList = store.open && (busy || hasResults || value.length >= 2);
  const showEmpty = !busy && !store.searchError && value.length >= 2 && !hasResults;

  const providerLabel = (provider: MessagingProvider) => t(`Common.providers.${channelLabelKey(provider)}`);

  return (
    <CommandPrimitive label={t("EntityChannels.addChannel.trigger")} shouldFilter={false}>
      <Popover open={showList} onOpenChange={(next) => store.setOpen(next)}>
        <AddChannelSearchField disabled={editor.isDisabled} expanded={showList} store={store} />

        <PopoverContent
          align="start"
          className="w-(--radix-popover-trigger-width) overflow-hidden p-0"
          onOpenAutoFocus={(event) => event.preventDefault()}
        >
          <CommandList aria-busy={busy || store.isAdding || undefined}>
            {busy && <SelectionOptionsSkeleton label={t("EntityChannels.addChannel.searching")} />}

            {!busy && store.searchError && (
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

            {showEmpty && <CommandEmpty>{t("EntityChannels.addChannel.noResults")}</CommandEmpty>}

            {!busy && candidates.length > 0 && (
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
                      disabled={store.isAdding || editor.isDisabled}
                      value={`${candidate.provider}:${candidate.value}`}
                      onSelect={() => runUserAction(() => store.selectCandidate(candidate))}
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

            {!busy && addAsNewOptions.length === 1 && (
              <CommandGroup>
                <CommandItem
                  key={`add:${addAsNewOptions[0]}`}
                  disabled={store.isAdding || editor.isDisabled}
                  value={`add:${addAsNewOptions[0]}`}
                  onSelect={() => runUserAction(() => store.addAsNew(addAsNewOptions[0]))}
                >
                  <Plus className="size-5 shrink-0" />

                  <span className="min-w-0 flex-1 truncate text-sm">
                    {t("EntityChannels.addChannel.addAs", {
                      value,
                      provider: providerLabel(addAsNewOptions[0]),
                    })}
                  </span>
                </CommandItem>
              </CommandGroup>
            )}

            {!busy && addAsNewOptions.length > 1 && (
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
                        disabled={store.isAdding || editor.isDisabled}
                        type="button"
                        onClick={() => runUserAction(() => store.addAsNew(provider))}
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

export const RecordIdentityEditor = observer(function RecordIdentityEditor({
  store,
  field,
}: {
  store: RecordEditorStore;
  field: RecordFieldView;
}) {
  return (
    <EntityDetailField fieldId={field.id}>
      <RecordChannels
        action={field.format?.onClick ?? "open"}
        controlStartAddon={<EntityDetailFieldDragHandle label={field.label} />}
        headingEndAddon={<EntityDetailFieldActions fieldId={field.id} label={field.label} />}
        label={field.label}
        recordChannels={{
          contextKey: store.channelComposeKey,
          canCompose: () => !store.isLoading && !store.pendingOperationId && !store.refreshRequired,
          captureContext: () => {
            const isCurrentSession = store.captureSession();
            const identities = JSON.stringify(store.form.identities);
            return () => isCurrentSession() && identities === JSON.stringify(store.form.identities);
          },
          inboxHref: store.record
            ? `/inbox?${encodeGetParams({
                filters: [
                  {
                    field: FilterFieldKey.participantContactId,
                    operator: FilterOperatorKey.in,
                    value: [recordReferenceKey(store.record.ref)],
                  },
                ],
              })}`
            : undefined,
          channels: store.form.identities,
          canEdit: !store.isDisabled,
          remove: (index) => {
            if (!store.isDisabled) {
              store.onChange(
                "identities",
                store.form.identities.filter((_, position) => position !== index),
              );
            }
          },
          addControl: <RecordChannelPopover editor={store} />,
        }}
      />
    </EntityDetailField>
  );
});
