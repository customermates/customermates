"use client";

import { ChevronDown } from "lucide-react";
import { observer } from "mobx-react-lite";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { FormLabel } from "@/components/forms/form-label";
import { useAppForm } from "@/components/forms/form-context";
import { useFormFieldErrors } from "@/components/forms/use-form-field";
import { Button } from "@/components/ui/button";
import { IconButton } from "@/components/ui/icon-button";
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
  const { hasError } = useFormFieldErrors(id);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const value = String(store?.getValue(id) ?? "");
  const domId = inputId ?? id;
  const canEdit = !store?.isLoading && !store?.isReadOnly;
  const iconLabel = (key: string) => t(`RecordModel.icons.${key}`);
  const known = RECORD_TYPE_ICON_KEYS.some((key) => key === value);
  const Current = recordTypeIcon(value);
  const search = query.trim().toLocaleLowerCase();
  const matches: string[] = RECORD_TYPE_ICON_KEYS.filter(
    (key) => !search || iconLabel(key).toLocaleLowerCase().includes(search) || key.toLowerCase().includes(search),
  );

  const focusKey = matches.includes(value) ? value : matches[0];

  function choose(key: string) {
    store?.onChange(id, key);
    setOpen(false);
    setQuery("");
  }

  function moveFocus(event: React.KeyboardEvent<HTMLDivElement>) {
    const step = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: COLUMNS, ArrowUp: -COLUMNS }[event.key];
    const buttons = [...event.currentTarget.querySelectorAll("button")];
    const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
    if (!step || index < 0) return;
    event.preventDefault();
    buttons[Math.min(Math.max(index + step, 0), buttons.length - 1)]?.focus();
  }

  return (
    <div className="flex flex-col gap-1.5">
      <FormLabel fieldId={id} htmlFor={domId}>
        {label}
      </FormLabel>

      <Popover open={canEdit && open} onOpenChange={(next) => setOpen(canEdit && next)}>
        <PopoverTrigger asChild>
          <Button
            aria-haspopup="dialog"
            aria-invalid={hasError}
            className="w-full justify-start"
            disabled={!canEdit}
            id={domId}
            variant="field"
          >
            <Current aria-hidden className="size-4 text-muted-foreground" />

            <span className="min-w-0 flex-1 truncate text-left">{known ? iconLabel(value) : iconLabel("folder")}</span>

            <ChevronDown aria-hidden className="size-4 opacity-50" />
          </Button>
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
            <div
              aria-label={t("RecordModel.iconChoose")}
              className="grid max-h-64 grid-cols-8 gap-1 overflow-y-auto"
              role="toolbar"
              onKeyDown={moveFocus}
            >
              {matches.map((key) => (
                <IconButton
                  key={key}
                  fieldAction
                  className="size-8"
                  icon={recordTypeIcon(key)}
                  iconClassName={cn("size-4", key === value && "text-primary")}
                  label={iconLabel(key)}
                  pressed={key === value}
                  tabIndex={key === focusKey ? 0 : -1}
                  onClick={() => choose(key)}
                />
              ))}
            </div>
          )}
        </PopoverContent>
      </Popover>
    </div>
  );
});
