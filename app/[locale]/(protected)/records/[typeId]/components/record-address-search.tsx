"use client";

import type { AddressCandidate } from "@/features/addresses/address-lookup.schema";
import type { RecordAddressLookupStore } from "./record-address-lookup.store";

import { useState } from "react";
import { observer } from "mobx-react-lite";
import { useTranslations } from "next-intl";
import { MapPin, Search } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { SelectionOptionsSkeleton } from "@/components/forms/selection-loading";
import { useHydratedIntlStore } from "@/core/stores/use-hydrated-intl-store";
import { runUserAction } from "@/core/errors/report-application-error";
import { addressDisplayText } from "@/features/records/record-address-value";
import { ADDRESS_SEARCH_MIN_LENGTH } from "./record-address-lookup.store";

const OPENSTREETMAP_COPYRIGHT_URL = "https://www.openstreetmap.org/copyright";

export const RecordAddressSearch = observer(function RecordAddressSearch({
  lookup,
  inputId,
  disabled,
  onPick,
}: {
  lookup: RecordAddressLookupStore;
  inputId?: string;
  disabled: boolean;
  onPick: (candidate: AddressCandidate) => void;
}) {
  const t = useTranslations();
  const locale = useHydratedIntlStore().formattingLocale;
  const [open, setOpen] = useState(false);
  const close = () => {
    setOpen(false);
    lookup.reset();
  };

  return (
    <Popover modal open={open && !disabled} onOpenChange={(next) => (next ? setOpen(true) : close())}>
      <PopoverTrigger asChild>
        <Button
          aria-expanded={open}
          className="w-full justify-start gap-2 px-3 font-normal text-muted-foreground"
          data-address-search=""
          disabled={disabled}
          id={inputId}
          role="combobox"
          type="button"
          variant="field"
        >
          <Search aria-hidden className="size-4 shrink-0 opacity-60" />

          <span className="truncate">{t("RecordModel.addressSearch.trigger")}</span>
        </Button>
      </PopoverTrigger>

      <PopoverContent align="start" className="w-(--radix-popover-trigger-width) min-w-72 p-0">
        <Command shouldFilter={false}>
          <CommandInput
            autoFocus
            aria-label={t("RecordModel.addressSearch.trigger")}
            placeholder={t("RecordModel.addressSearch.placeholder")}
            value={lookup.query}
            onValueChange={lookup.setQuery}
          />

          <CommandList aria-busy={lookup.status === "searching" || undefined}>
            {lookup.status === "idle" && (
              <p className="px-3 py-4 text-center text-sm text-muted-foreground">
                {t("RecordModel.addressSearch.hint", { count: ADDRESS_SEARCH_MIN_LENGTH })}
              </p>
            )}

            {lookup.status === "searching" && <SelectionOptionsSkeleton label={t("Loading.text")} />}

            {lookup.status === "failed" && (
              <div className="flex flex-col items-center gap-2 px-3 py-4 text-center text-sm" role="alert">
                <span className="text-muted-foreground">
                  {lookup.failure === "addressLookupRateLimited"
                    ? t("Common.errors.addressLookupRateLimited")
                    : t("Common.errors.addressLookupUnavailable")}
                </span>

                <Button size="sm" type="button" variant="secondary" onClick={() => runUserAction(lookup.retry)}>
                  {t("ErrorCard.retry")}
                </Button>
              </div>
            )}

            {lookup.status === "ready" && <CommandEmpty>{t("RecordModel.addressSearch.empty")}</CommandEmpty>}

            {lookup.status === "ready" && lookup.candidates.length > 0 && (
              <CommandGroup>
                {lookup.candidates.map((candidate, index) => (
                  <CommandItem
                    key={candidate.candidateToken}
                    data-address-candidate=""
                    value={String(index)}
                    onSelect={() => {
                      onPick(candidate);
                      close();
                    }}
                  >
                    <MapPin aria-hidden className="size-4 shrink-0 text-muted-foreground" />

                    <span className="flex min-w-0 flex-col">
                      {candidate.name && <span className="truncate font-medium">{candidate.name}</span>}

                      <span className="truncate">{addressDisplayText(candidate.address, locale)}</span>
                    </span>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
          </CommandList>

          {lookup.status === "ready" && lookup.attribution && (
            <a
              className="block border-t px-3 py-1.5 text-xs text-muted-foreground underline-offset-2 hover:underline"
              href={OPENSTREETMAP_COPYRIGHT_URL}
              rel="noopener noreferrer"
              target="_blank"
            >
              {lookup.attribution}
            </a>
          )}
        </Command>
      </PopoverContent>
    </Popover>
  );
});
