"use client";

import * as React from "react";
import { Command as CommandPrimitive, useCommandState } from "cmdk";
import { SearchIcon } from "lucide-react";

import { cn } from "@/core/utils/cn";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useOverlayFocusReturn } from "@/components/ui/use-overlay-focus-return";

function Command({ className, ...props }: React.ComponentProps<typeof CommandPrimitive>) {
  return (
    <CommandPrimitive
      className={cn("flex size-full flex-col overflow-hidden rounded-md bg-popover text-popover-foreground", className)}
      data-slot="command"
      {...props}
    />
  );
}

function CommandDialog({
  title,
  description,
  children,
  className,
  commandProps,
  showCloseButton = true,
  focusReturnTarget,
  focusReturnFallback,
  open,
  ...props
}: React.ComponentProps<typeof Dialog> & {
  title: string;
  description: string;
  className?: string;
  commandProps?: React.ComponentProps<typeof Command>;
  showCloseButton?: boolean;
  focusReturnTarget?: HTMLElement | null;
  focusReturnFallback?: HTMLElement | null;
}) {
  const focusReturn = useOverlayFocusReturn(open, focusReturnTarget, focusReturnFallback);

  return (
    <Dialog open={open} {...props}>
      <DialogContent
        className={cn("overflow-hidden p-0", className)}
        showCloseButton={showCloseButton}
        {...focusReturn}
      >
        <DialogHeader className="sr-only">
          <DialogTitle>{title}</DialogTitle>

          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        <Command
          {...commandProps}
          className={cn(
            "**:data-[slot=command-input-wrapper]:h-11 **:[[cmdk-group-heading]]:pt-2 **:[[cmdk-group-heading]]:pb-1 [&_[cmdk-group]:not([hidden])_~[cmdk-group]]:pt-0 **:[[cmdk-input]]:h-11 **:[[cmdk-item]]:min-h-10 md:**:[[cmdk-item]]:min-h-8 md:**:[[cmdk-item]]:py-1",
            commandProps?.className,
          )}
        >
          {children}
        </Command>
      </DialogContent>
    </Dialog>
  );
}

function useCommandInputAria(containerRef: React.RefObject<HTMLElement | null>, expanded?: boolean) {
  const selectedValue = useCommandState((state) => state.value);
  const listIdRef = React.useRef<string | null>(null);

  React.useLayoutEffect(() => {
    const input = containerRef.current?.querySelector<HTMLInputElement>("[cmdk-input]");
    if (!input) return;

    listIdRef.current ??= input.getAttribute("aria-controls");
    const listId = listIdRef.current;
    if (expanded !== undefined) {
      input.setAttribute("aria-expanded", String(expanded));
      if (expanded && listId) input.setAttribute("aria-controls", listId);
      else input.removeAttribute("aria-controls");
    }

    const list = expanded !== false && listId ? document.getElementById(listId) : null;
    const option = selectedValue ? list?.querySelector<HTMLElement>('[cmdk-item][aria-selected="true"]') : null;
    if (option?.id) input.setAttribute("aria-activedescendant", option.id);
    else input.removeAttribute("aria-activedescendant");
  });
}

function CommandInput({ className, ...props }: React.ComponentProps<typeof CommandPrimitive.Input>) {
  const wrapperRef = React.useRef<HTMLDivElement>(null);
  useCommandInputAria(wrapperRef);

  return (
    <div ref={wrapperRef} className="flex h-9 items-center gap-2 border-b px-3" data-slot="command-input-wrapper">
      <SearchIcon className="size-4 shrink-0 opacity-50" />

      <CommandPrimitive.Input
        className={cn(
          "flex h-10 w-full rounded-md bg-transparent py-3 text-base outline-hidden placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
          className,
        )}
        data-slot="command-input"
        {...props}
      />
    </div>
  );
}

function CommandList({ className, ...props }: React.ComponentProps<typeof CommandPrimitive.List>) {
  return (
    <CommandPrimitive.List
      className={cn(
        "max-h-[min(300px,var(--overlay-block-budget))] scroll-py-1 overflow-x-hidden overflow-y-auto overscroll-contain",
        className,
      )}
      data-slot="command-list"
      {...props}
    />
  );
}

function CommandEmpty({
  persistent = false,
  className,
  ...props
}: React.ComponentProps<typeof CommandPrimitive.Empty> & { persistent?: boolean }) {
  if (persistent) {
    return (
      <div className={cn("py-6 text-center text-sm", className)} data-slot="command-empty" role="status" {...props} />
    );
  }
  return (
    <CommandPrimitive.Empty
      className={cn("py-6 text-center text-sm", className)}
      data-slot="command-empty"
      {...props}
    />
  );
}

function CommandGroup({ className, ...props }: React.ComponentProps<typeof CommandPrimitive.Group>) {
  return (
    <CommandPrimitive.Group
      className={cn(
        "overflow-hidden p-1 text-foreground **:[[cmdk-group-heading]]:px-2 **:[[cmdk-group-heading]]:py-1.5 **:[[cmdk-group-heading]]:text-xs **:[[cmdk-group-heading]]:font-medium **:[[cmdk-group-heading]]:text-muted-foreground",
        className,
      )}
      data-slot="command-group"
      {...props}
    />
  );
}

function CommandSeparator({ className, ...props }: React.ComponentProps<typeof CommandPrimitive.Separator>) {
  return (
    <CommandPrimitive.Separator
      className={cn("-mx-1 h-px bg-border", className)}
      data-slot="command-separator"
      {...props}
    />
  );
}

function CommandItem({ className, ...props }: React.ComponentProps<typeof CommandPrimitive.Item>) {
  return (
    <CommandPrimitive.Item
      className={cn(
        "relative flex cursor-default items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-hidden select-none data-[disabled=true]:pointer-events-none data-[disabled=true]:opacity-50 data-[selected=true]:bg-accent data-[selected=true]:text-accent-foreground [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 [&_svg:not([class*='text-'])]:text-muted-foreground",
        className,
      )}
      data-slot="command-item"
      {...props}
    />
  );
}

function CommandShortcut({ className, ...props }: React.ComponentProps<"span">) {
  return (
    <span
      className={cn("ml-auto text-xs tracking-widest text-muted-foreground", className)}
      data-slot="command-shortcut"
      {...props}
    />
  );
}

export {
  Command,
  CommandPrimitive,
  CommandDialog,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandShortcut,
  CommandSeparator,
  useCommandInputAria,
};
