"use client";

import { ChevronDown } from "lucide-react";
import { observer } from "mobx-react-lite";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { FormLabel } from "@/components/forms/form-label";
import { useAppForm } from "@/components/forms/form-context";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/core/utils/cn";

import { RECORD_TYPE_ICON_KEYS, recordTypeIcon } from "./record-type-icon";

type Props = {
  id: string;
  inputId?: string;
  label: string;
};

const COLUMNS = 8;

export const FormRecordTypeIcon = observer(({ id, inputId, label }: Props) => {
  const t = useTranslations();
  const store = useAppForm();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const value = String(store?.getValue(id) ?? "");
  const domId = inputId ?? id;
  const canEdit = !store?.isLoading && !store?.isReadOnly;
  const iconLabel = (key: string) => t(`RecordModel.icons.${key}`);
  const known = RECORD_TYPE_ICON_KEYS.some((key) => key === value);
  const Current = recordTypeIcon(value);
  const search = query.trim().toLocaleLowerCase();
  const matches = RECORD_TYPE_ICON_KEYS.filter(
    (key) => !search || iconLabel(key).toLocaleLowerCase().includes(search) || key.toLowerCase().includes(search),
  );

  function choose(key: string) {
    store?.onChange(id, key);
    setOpen(false);
    setQuery("");
  }

  function moveFocus(event: React.KeyboardEvent<HTMLButtonElement>, index: number) {
    const step = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: COLUMNS, ArrowUp: -COLUMNS }[event.key];
    if (!step) return;
    event.preventDefault();
    const grid = event.currentTarget.parentElement;
    const target = grid?.children[Math.min(Math.max(index + step, 0), matches.length - 1)];
    if (target instanceof HTMLElement) target.focus();
  }

  return (
    <div className="flex flex-col gap-1.5">
      <FormLabel fieldId={id} htmlFor={domId}>
        {label}
      </FormLabel>

      <Popover open={canEdit && open} onOpenChange={(next) => setOpen(canEdit && next)}>
        <PopoverTrigger asChild>
          <button
            aria-haspopup="dialog"
            className="flex h-9 w-full items-center gap-2 rounded-md border border-input bg-transparent px-3 text-left text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-input/30"
            disabled={!canEdit}
            id={domId}
            type="button"
          >
            <Current aria-hidden className="size-4 text-muted-foreground" />

            <span className="min-w-0 flex-1 truncate">{known ? iconLabel(value) : iconLabel("folder")}</span>

            <ChevronDown aria-hidden className="size-4 opacity-50" />
          </button>
        </PopoverTrigger>

        <PopoverContent align="start" aria-label={t("RecordModel.iconChoose")} className="w-80 p-2">
          <Input
            autoFocus
            aria-label={t("RecordModel.iconSearch")}
            className="mb-2 h-8"
            placeholder={t("RecordModel.iconSearch")}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && matches[0]) {
                event.preventDefault();
                choose(matches[0]);
              }
            }}
          />

          {matches.length === 0 ? (
            <p className="px-1 py-4 text-center text-sm text-muted-foreground">{t("RecordModel.iconNoMatch")}</p>
          ) : (
            <div className="grid max-h-64 grid-cols-8 gap-1 overflow-y-auto" role="group">
              {matches.map((key, index) => {
                const Icon = recordTypeIcon(key);
                const selected = key === value;
                return (
                  <button
                    key={key}
                    aria-label={iconLabel(key)}
                    aria-pressed={selected}
                    className={cn(
                      "flex size-8 items-center justify-center rounded-md text-muted-foreground outline-none hover:bg-accent hover:text-accent-foreground focus-visible:ring-2 focus-visible:ring-ring",
                      selected && "bg-primary/10 text-primary",
                    )}
                    title={iconLabel(key)}
                    type="button"
                    onClick={() => choose(key)}
                    onKeyDown={(event) => moveFocus(event, index)}
                  >
                    <Icon aria-hidden className="size-4" />
                  </button>
                );
              })}
            </div>
          )}
        </PopoverContent>
      </Popover>
    </div>
  );
});
