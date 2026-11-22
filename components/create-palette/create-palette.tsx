"use client";

import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

import { CornerDownLeft, Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useMemo, useState } from "react";

import { Kbd, useKeyboardPlatform } from "@/components/keyboard/shortcut-keys";
import { keyLabel } from "@/components/keyboard/key-matching";
import { Badge } from "@/components/ui/badge";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Spinner } from "@/components/ui/spinner";
import { MateIcon } from "@/components/mate/mate-icon";
import { cn } from "@/core/utils/cn";

import { filterCreateTemplates } from "./create-palette-filter";

export type CreatePaletteTemplate = {
  id: string;
  title: string;
  description?: string;
  keywords?: readonly string[];
  icon: LucideIcon;
  badge?: { label: string; tone: "ink" | "outline" };
};

export type CreatePaletteAi = {
  label: string;
  pending?: boolean;
  notice?: string | null;
  onSelect: (text: string) => void;
};

export type CreatePaletteBlank = {
  label: string;
  description?: string;
  onSelect: (text: string) => void;
};

type Props<T extends CreatePaletteTemplate> = {
  open: boolean;
  title: string;
  placeholder: string;
  query: string;
  templates: readonly T[];
  templatesHeading?: string;
  ai?: CreatePaletteAi | null;
  blank?: CreatePaletteBlank | null;
  focusReturnTarget?: HTMLElement | null;
  focusReturnFallback?: HTMLElement | null;
  onQueryChange: (query: string) => void;
  onTemplate: (template: T, text: string) => void;
  onClose: () => void;
};

export const CREATE_PALETTE_AI_VALUE = "create-palette-ai";
export const CREATE_PALETTE_BLANK_VALUE = "create-palette-blank";
const TEMPLATE_VALUE_PREFIX = "create-palette-template:";

export function createPaletteTemplateValue(id: string): string {
  return `${TEMPLATE_VALUE_PREFIX}${id}`;
}

function RowIcon({ icon: Icon, accent = false }: { icon: LucideIcon; accent?: boolean }) {
  return (
    <span
      aria-hidden
      className={cn(
        "flex size-8 shrink-0 items-center justify-center rounded-md border",
        accent ? "border-transparent bg-primary/10 text-primary" : "bg-muted text-muted-foreground",
      )}
    >
      <Icon className={cn("size-4", accent ? "text-primary" : "text-muted-foreground")} />
    </span>
  );
}

function RowText({ title, description }: { title: string; description?: string }) {
  return (
    <span className="flex min-w-0 flex-1 flex-col">
      <span className="truncate text-sm text-foreground">{title}</span>

      {description ? <span className="truncate text-xs text-muted-foreground">{description}</span> : null}
    </span>
  );
}

function Hint({ label, symbol }: { label: string; symbol: ReactNode }) {
  return (
    <div className="flex items-center gap-1.5 whitespace-nowrap">
      <Kbd>{symbol}</Kbd>

      <span>{label}</span>
    </div>
  );
}

export function CreatePalette<T extends CreatePaletteTemplate>({
  open,
  title,
  placeholder,
  query,
  templates,
  templatesHeading,
  ai = null,
  blank = null,
  focusReturnTarget,
  focusReturnFallback,
  onQueryChange,
  onTemplate,
  onClose,
}: Props<T>) {
  const t = useTranslations();
  const tabKey = keyLabel("Tab", useKeyboardPlatform());
  const [browseAll, setBrowseAll] = useState(false);
  const text = query.trim();
  const filtered = useMemo(() => filterCreateTemplates(templates, query), [templates, query]);
  const visible = browseAll ? templates : filtered;
  const hidden = templates.length - visible.length;
  const showAi = ai !== null && text.length > 0;
  const pending = ai?.pending === true;
  const values = useMemo(
    () => [
      ...(showAi ? [CREATE_PALETTE_AI_VALUE] : []),
      ...visible.map((template) => createPaletteTemplateValue(template.id)),
      ...(blank ? [CREATE_PALETTE_BLANK_VALUE] : []),
    ],
    [blank, showAi, visible],
  );
  const firstValue = values[0] ?? "";
  const [selected, setSelected] = useState(firstValue);

  useEffect(() => {
    setSelected(firstValue);
  }, [firstValue, query, browseAll]);

  useEffect(() => {
    if (!open) setBrowseAll(false);
  }, [open]);

  const selectAi = () => {
    if (ai && text && !pending) ai.onSelect(text);
  };

  return (
    <CommandDialog
      commandProps={{ shouldFilter: false, value: selected, onValueChange: setSelected }}
      description={placeholder}
      focusReturnFallback={focusReturnFallback}
      focusReturnTarget={focusReturnTarget}
      open={open}
      title={title}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <CommandInput
        data-create-palette-input=""
        placeholder={placeholder}
        readOnly={pending}
        value={query}
        onKeyDown={(event) => {
          if (event.key !== "Tab" || event.shiftKey || (hidden === 0 && !browseAll)) return;
          event.preventDefault();
          setBrowseAll((current) => !current);
        }}
        onValueChange={(next) => {
          setBrowseAll(false);
          onQueryChange(next);
        }}
      />

      {ai?.notice ? (
        <p
          className="border-b border-border px-4 py-2 text-xs text-warning-soft-foreground"
          data-create-palette-notice=""
          role="status"
        >
          {ai.notice}
        </p>
      ) : null}

      <CommandList className="max-h-[min(420px,var(--overlay-block-budget))]">
        {showAi && ai ? (
          <CommandGroup>
            <CommandItem
              className="gap-3 py-2"
              data-create-palette-ai=""
              disabled={pending}
              value={CREATE_PALETTE_AI_VALUE}
              onSelect={selectAi}
            >
              <RowIcon accent icon={MateIcon} />

              <RowText description={t("CreatePalette.quoted", { text })} title={ai.label} />

              {pending ? (
                <Spinner aria-label={t("PageState.loading")} />
              ) : (
                <Kbd>
                  <CornerDownLeft className="size-3" />
                </Kbd>
              )}
            </CommandItem>
          </CommandGroup>
        ) : null}

        {visible.length > 0 ? (
          <CommandGroup heading={templatesHeading ?? t("CreatePalette.templates")}>
            {visible.map((template) => (
              <CommandItem
                key={template.id}
                className="gap-3 py-2"
                data-create-palette-template={template.id}
                disabled={pending}
                value={createPaletteTemplateValue(template.id)}
                onSelect={() => onTemplate(template, text)}
              >
                <RowIcon icon={template.icon} />

                <RowText description={template.description} title={template.title} />

                {template.badge ? <Badge variant={template.badge.tone}>{template.badge.label}</Badge> : null}
              </CommandItem>
            ))}
          </CommandGroup>
        ) : templates.length > 0 && !showAi ? (
          <CommandEmpty persistent className="py-4 text-xs text-muted-foreground">
            {t("CreatePalette.noTemplates")}
          </CommandEmpty>
        ) : null}

        {blank ? (
          <CommandGroup heading={showAi || visible.length > 0 ? t("CreatePalette.or") : undefined}>
            <CommandItem
              className="gap-3 py-2"
              data-create-palette-blank=""
              disabled={pending}
              value={CREATE_PALETTE_BLANK_VALUE}
              onSelect={() => blank.onSelect(text)}
            >
              <RowIcon icon={Plus} />

              <RowText description={blank.description} title={blank.label} />
            </CommandItem>
          </CommandGroup>
        ) : null}
      </CommandList>

      <div className="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-1 border-t border-border px-4 py-2 text-[11px] text-muted-foreground">
        <Hint label={t("GlobalSearch.hintNavigate")} symbol="↑↓" />

        <Hint label={t("GlobalSearch.hintOpen")} symbol={<CornerDownLeft className="size-3" />} />

        {hidden > 0 ? (
          <Hint label={t("CreatePalette.hintBrowseAll", { count: templates.length })} symbol={tabKey} />
        ) : null}

        {browseAll ? <Hint label={t("CreatePalette.hintMatching")} symbol={tabKey} /> : null}
      </div>
    </CommandDialog>
  );
}
