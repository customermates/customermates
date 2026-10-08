"use client";

import type { ReactNode } from "react";

import { createContext, useContext } from "react";
import { Tabs as TabsPrimitive } from "radix-ui";

import { cn } from "@/core/utils/cn";

export type SegmentedControlItem<Value extends string> = {
  value: Value;
  label: ReactNode;
  disabled?: boolean;
  invalid?: boolean;
  invalidLabel?: string;
};

type Props<Value extends string> = {
  value: Value;
  items: readonly SegmentedControlItem<Value>[];
  label: string;
  idPrefix?: string;
  className?: string;
  listClassName?: string;
  children?: ReactNode;
  onValueChange: (value: Value) => void;
};

export function SegmentedControl<Value extends string>({
  value,
  items,
  label,
  idPrefix,
  className,
  listClassName,
  children,
  onValueChange,
}: Props<Value>) {
  return (
    <SegmentIdPrefixContext.Provider value={idPrefix}>
      <TabsPrimitive.Root
        activationMode="automatic"
        className={cn("flex min-h-0 flex-col gap-3", className)}
        data-slot="segmented-control"
        value={value}
        onValueChange={(next) => onValueChange(next as Value)}
      >
        <TabsPrimitive.List
          aria-label={label}
          className={cn(
            "grid h-8 w-full shrink-0 auto-cols-fr grid-flow-col gap-0.5 rounded-lg bg-muted p-0.5 text-muted-foreground",
            listClassName,
          )}
          data-slot="segmented-control-list"
        >
          {items.map((item) => (
            <TabsPrimitive.Trigger
              key={item.value}
              className={cn(
                "inline-flex min-w-0 items-center justify-center gap-1.5 rounded-md px-2 text-sm font-medium whitespace-nowrap transition-colors outline-none",
                "hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:ring-inset disabled:pointer-events-none disabled:opacity-50",
                "data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm",
                "dark:data-[state=active]:bg-accent",
              )}
              data-invalid={item.invalid || undefined}
              data-slot="segmented-control-item"
              disabled={item.disabled}
              {...(idPrefix ? { id: segmentId(idPrefix, item.value) } : {})}
              value={item.value}
            >
              <span className="truncate">{item.label}</span>

              {item.invalid && (
                <>
                  <span aria-hidden className="size-1.5 shrink-0 rounded-full bg-destructive" data-tab-error-dot="" />

                  {item.invalidLabel ? <span className="sr-only">{item.invalidLabel}</span> : null}
                </>
              )}
            </TabsPrimitive.Trigger>
          ))}
        </TabsPrimitive.List>

        {children}
      </TabsPrimitive.Root>
    </SegmentIdPrefixContext.Provider>
  );
}

const SegmentIdPrefixContext = createContext<string | undefined>(undefined);

function segmentId(idPrefix: string, value: string) {
  return `${idPrefix}-tab-${value}`;
}

export function SegmentedControlPanel({
  value,
  forceMount,
  className,
  children,
}: {
  value: string;
  forceMount?: boolean;
  className?: string;
  children: ReactNode;
}) {
  const idPrefix = useContext(SegmentIdPrefixContext);
  return (
    <TabsPrimitive.Content
      {...(idPrefix ? { "aria-labelledby": segmentId(idPrefix, value) } : {})}
      className={cn("min-h-0 flex-1 outline-none", forceMount && "data-[state=inactive]:hidden", className)}
      data-slot="segmented-control-panel"
      forceMount={forceMount || undefined}
      value={value}
    >
      {children}
    </TabsPrimitive.Content>
  );
}
