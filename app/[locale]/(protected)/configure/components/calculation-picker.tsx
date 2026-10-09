"use client";

import type { ReactNode } from "react";

import { useState } from "react";
import { Check, ChevronLeft, ChevronRight } from "lucide-react";
import { useTranslations } from "next-intl";

import { ResponsiveOverlay } from "@/components/modal/responsive-overlay";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";

export type CalculationPickerItem = {
  id: string;
  label: string;
  icon?: ReactNode;
  checked?: boolean;
  onSelect?: () => void;
  page?: CalculationPickerPage;
};

export type CalculationPickerGroup = { heading: string; items: CalculationPickerItem[] };

export type CalculationPickerPage = {
  title: string;
  groups?: CalculationPickerGroup[];
  content?: (close: () => void) => ReactNode;
};

export function CalculationPicker({
  page,
  trigger,
  open: openProp,
  onOpenChange,
}: {
  page: CalculationPickerPage;
  trigger: ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const t = useTranslations();
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false);
  const [stack, setStack] = useState<CalculationPickerPage[]>([]);
  const open = openProp ?? uncontrolledOpen;
  const current = stack.at(-1) ?? page;
  const setOpen = (next: boolean) => {
    if (!next) setStack([]);
    if (openProp === undefined) setUncontrolledOpen(next);
    onOpenChange?.(next);
  };
  const close = () => setOpen(false);
  return (
    <ResponsiveOverlay
      open={open}
      popoverClassName="w-[min(22rem,var(--radix-popover-content-available-width))]"
      title={
        stack.length ? (
          <button className="flex items-center gap-1.5" type="button" onClick={() => setStack(stack.slice(0, -1))}>
            <ChevronLeft aria-hidden className="size-3.5" />

            {current.title}
          </button>
        ) : (
          current.title
        )
      }
      trigger={trigger}
      onOpenChange={setOpen}
    >
      {current.content ? (
        <div className="px-3 pb-3">{current.content(close)}</div>
      ) : (
        <Command loop className="h-auto! min-h-0 overflow-visible bg-transparent" label={current.title}>
          <CommandInput autoFocus placeholder={t("Common.table.search")} />

          <CommandList className="max-h-none! overflow-visible">
            <CommandEmpty>{t("Common.inputs.emptyContent")}</CommandEmpty>

            {current.groups?.map((group) =>
              group.items.length ? (
                <CommandGroup key={group.heading} heading={group.heading || undefined}>
                  {group.items.map((item) => (
                    <CommandItem
                      key={item.id}
                      data-calculation-option={item.id}
                      value={`${group.heading} ${item.label} ${item.id}`}
                      onSelect={() => {
                        if (item.page) setStack([...stack, item.page]);
                        else {
                          item.onSelect?.();
                          close();
                        }
                      }}
                    >
                      {item.icon}

                      <span className="min-w-0 flex-1 truncate">{item.label}</span>

                      {item.checked && <Check aria-hidden className="size-4 text-muted-foreground" />}

                      {item.page && <ChevronRight aria-hidden className="size-4 text-muted-foreground" />}
                    </CommandItem>
                  ))}
                </CommandGroup>
              ) : null,
            )}
          </CommandList>
        </Command>
      )}
    </ResponsiveOverlay>
  );
}
