"use client";

import { useState } from "react";
import { observer } from "mobx-react-lite";
import { useTranslations } from "next-intl";
import { Plus } from "lucide-react";
import type { MessagingProvider } from "@/generated/prisma";
import type { RecordEditorStore } from "./record-editor.store";
import { ContactChannels } from "../../../contacts/components/contact-channels";
import { Command, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover";
import { inferChannelProviders, normalizeChannelValue } from "@/features/contacts/channel-value";
import { channelClass, channelLabelKey } from "@/ee/messaging/provider";
import { EntityDetailFieldActions } from "@/components/entity-detail/entity-detail-field-actions";
import { EntityDetailFieldDragHandle } from "@/components/entity-detail/entity-detail-fields";
import { EntityDetailField } from "@/components/entity-detail/entity-detail-field";

export const RecordIdentityEditor = observer(function RecordIdentityEditor({ store }: { store: RecordEditorStore }) {
  const t = useTranslations();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const providers = inferChannelProviders(query).filter((provider) => {
    const value = normalizeChannelValue(provider, query);
    return (
      value &&
      !store.form.identities.some(
        (row) =>
          channelClass(row.provider) === channelClass(provider) && (row.value === value || row.messagingId === value),
      )
    );
  });
  const add = (provider: MessagingProvider) => {
    if (store.isReadOnly) return;
    const value = normalizeChannelValue(provider, query);
    if (!value) return;
    store.onChange("identities", [...store.form.identities, { provider, value }]);
    setQuery("");
    setOpen(false);
  };
  return (
    <EntityDetailField fieldId="system:channels">
      <ContactChannels
        controlStartAddon={<EntityDetailFieldDragHandle label={t("EntityChannels.heading")} />}
        headingEndAddon={<EntityDetailFieldActions fieldId="system:channels" label={t("EntityChannels.heading")} />}
        recordChannels={{
          channels: store.form.identities,
          canEdit: !store.isReadOnly,
          remove: (index) => {
            if (!store.isReadOnly) {
              store.onChange(
                "identities",
                store.form.identities.filter((_, position) => position !== index),
              );
            }
          },
          addControl: (
            <Command shouldFilter={false}>
              <Popover open={open && providers.length > 0} onOpenChange={setOpen}>
                <PopoverAnchor asChild>
                  <div className="border-input rounded-md border">
                    <CommandInput
                      aria-label={t("EntityChannels.addChannel.trigger")}
                      placeholder={t("EntityChannels.addChannel.searchPlaceholder")}
                      value={query}
                      onFocus={() => setOpen(true)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" && providers.length === 1) {
                          event.preventDefault();
                          add(providers[0]);
                        }
                        if (event.key === "Escape") {
                          event.preventDefault();
                          event.stopPropagation();
                          setOpen(false);
                        }
                      }}
                      onValueChange={(value) => {
                        setQuery(value);
                        setOpen(true);
                      }}
                    />
                  </div>
                </PopoverAnchor>

                <PopoverContent
                  align="start"
                  className="w-(--radix-popover-trigger-width) p-0"
                  onOpenAutoFocus={(event) => event.preventDefault()}
                >
                  <CommandList>
                    {providers.map((provider) => (
                      <CommandItem key={provider} value={provider} onSelect={() => add(provider)}>
                        <Plus className="size-4" />

                        {t("EntityChannels.addChannel.addAs", {
                          value: query.trim(),
                          provider: t(`Common.providers.${channelLabelKey(provider)}`),
                        })}
                      </CommandItem>
                    ))}
                  </CommandList>
                </PopoverContent>
              </Popover>
            </Command>
          ),
        }}
      />
    </EntityDetailField>
  );
});
