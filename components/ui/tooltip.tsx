"use client";

import * as React from "react";
import { Tooltip as TooltipPrimitive } from "radix-ui";

import { cn } from "@/core/utils/cn";
import { OVERLAY_COLLISION_PADDING } from "./overlay-contract";

const pointerMovesClaimedByTooltip = new WeakSet<Event>();

function px(value: string) {
  return Number.parseFloat(value) || 0;
}

export function fitWrappedTooltip(content: HTMLElement, text: HTMLElement) {
  content.style.width = "";
  const style = getComputedStyle(content);
  const lineHeight = px(style.lineHeight) || px(style.fontSize) * 1.5;
  const inner =
    content.getBoundingClientRect().height -
    px(style.paddingTop) -
    px(style.paddingBottom) -
    px(style.borderTopWidth) -
    px(style.borderBottomWidth);
  if (!lineHeight || inner <= lineHeight * 1.5) return;
  const range = document.createRange();
  range.selectNodeContents(text);
  if (typeof range.getClientRects !== "function") return;
  const lines = new Map<number, { left: number; right: number }>();
  for (const rect of Array.from(range.getClientRects())) {
    if (!rect.width) continue;
    const key = Math.round(rect.top);
    const line = lines.get(key);
    lines.set(key, {
      left: Math.min(line?.left ?? rect.left, rect.left),
      right: Math.max(line?.right ?? rect.right, rect.right),
    });
  }
  if (lines.size < 2) return;
  const longest = Math.max(...Array.from(lines.values(), (line) => line.right - line.left));
  const frame = px(style.paddingLeft) + px(style.paddingRight) + px(style.borderLeftWidth) + px(style.borderRightWidth);
  const width = Math.ceil(longest + frame) + 1;
  if (width < content.getBoundingClientRect().width) content.style.width = `${width}px`;
}

const TooltipProviderContext = React.createContext(false);

function TooltipProvider({ delayDuration = 0, ...props }: React.ComponentProps<typeof TooltipPrimitive.Provider>) {
  return (
    <TooltipProviderContext.Provider value>
      <TooltipPrimitive.Provider
        disableHoverableContent
        data-slot="tooltip-provider"
        delayDuration={delayDuration}
        {...props}
      />
    </TooltipProviderContext.Provider>
  );
}

const TooltipHasContentContext = React.createContext(false);

function Tooltip({ children, ...props }: React.ComponentProps<typeof TooltipPrimitive.Root>) {
  const hasContent = React.Children.toArray(children).some(
    (child) => React.isValidElement(child) && child.type === TooltipContent,
  );
  const root = (
    <TooltipHasContentContext.Provider value={hasContent}>
      <TooltipPrimitive.Root data-slot="tooltip" {...props}>
        {children}
      </TooltipPrimitive.Root>
    </TooltipHasContentContext.Provider>
  );
  return React.useContext(TooltipProviderContext) ? root : <TooltipProvider>{root}</TooltipProvider>;
}

function TooltipTrigger({ onFocus, onPointerMove, ...props }: React.ComponentProps<typeof TooltipPrimitive.Trigger>) {
  const hasContent = React.useContext(TooltipHasContentContext);
  return (
    <TooltipPrimitive.Trigger
      data-slot="tooltip-trigger"
      onFocus={(event) => {
        if (!event.currentTarget.matches(":focus-visible")) event.preventDefault();
        onFocus?.(event);
      }}
      onPointerMove={(event) => {
        if (pointerMovesClaimedByTooltip.has(event.nativeEvent)) event.preventDefault();
        if (hasContent) pointerMovesClaimedByTooltip.add(event.nativeEvent);
        onPointerMove?.(event);
      }}
      {...props}
    />
  );
}

function TooltipContent({
  className,
  sideOffset = 0,
  collisionPadding = OVERLAY_COLLISION_PADDING,
  children,
  ...props
}: React.ComponentProps<typeof TooltipPrimitive.Content>) {
  const contentRef = React.useRef<HTMLDivElement>(null);
  const textRef = React.useRef<HTMLSpanElement>(null);
  React.useLayoutEffect(() => {
    if (contentRef.current && textRef.current) fitWrappedTooltip(contentRef.current, textRef.current);
  }, [children]);
  return (
    <TooltipPrimitive.Portal>
      <TooltipPrimitive.Content
        ref={contentRef}
        className={cn(
          "pointer-events-none z-50 w-fit max-w-[min(20rem,var(--radix-tooltip-content-available-width))] origin-(--radix-tooltip-content-transform-origin) animate-in rounded-md border border-border bg-tooltip px-2.5 py-1.5 text-xs text-balance break-words text-tooltip-foreground shadow-md fade-in-0 zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 motion-reduce:animate-none",
          className,
        )}
        collisionPadding={collisionPadding}
        data-slot="tooltip-content"
        sideOffset={sideOffset}
        {...props}
      >
        <span ref={textRef} className="contents" data-tooltip-text="">
          {children}
        </span>

        <TooltipPrimitive.Arrow className="z-50 size-2 translate-y-[calc(-50%_-_2px)] rotate-45 bg-tooltip fill-tooltip" />
      </TooltipPrimitive.Content>
    </TooltipPrimitive.Portal>
  );
}

export { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider };
