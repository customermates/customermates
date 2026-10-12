"use client";

import type { ComponentProps, KeyboardEvent, ReactElement, ReactNode, Ref, SyntheticEvent } from "react";

import { Ellipsis, ExternalLink } from "lucide-react";
import { useTranslations } from "next-intl";
import {
  cloneElement,
  createContext,
  useCallback,
  useContext,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";

import { cn } from "@/core/utils/cn";
import { stripLocalePrefix } from "@/i18n/locale-registry";
import { IntlLink } from "@/i18n/navigation";

import { ContextMenu, ContextMenuContent, ContextMenuTrigger } from "./context-menu";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "./dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "./tooltip";

type CloseAutoFocus = (event: Event) => void;

type ItemMenu = { label?: string; menu?: ReactNode; onCloseAutoFocus?: CloseAutoFocus };

type ItemActionsValue = ItemMenu & { href?: string; contentClassName?: string };

const ItemActionsContext = createContext<ItemActionsValue | null>(null);

const RegisterContext = createContext<((menu: ItemMenu | null) => void) | null>(null);

const TOUCH_INPUT = "not all and (hover: hover) and (pointer: fine)";

const KEYBOARD_ECHO_MS = 500;

const LONG_PRESS_CLICK_MS = 1000;

export const ITEM_ACTIONS_TRIGGER_CLASS =
  "opacity-0 transition-opacity focus-visible:opacity-100 data-[state=open]:opacity-100 fine-hover:group-hover/item-actions:opacity-100 fine-hover:group-focus-within/item-actions:opacity-100 touch-input:not-focus-visible:not-data-[state=open]:sr-only";

export const ITEM_REVEAL_GROUP_CLASS = "group/reveal";

export const ITEM_REVEAL_CLASS =
  "fine-hover:opacity-0 fine-hover:transition-opacity fine-hover:group-hover/reveal:opacity-100 fine-hover:group-focus-within/reveal:opacity-100 fine-hover:focus-visible:opacity-100 touch-input:opacity-100";

const DEFAULT_TRIGGER_CLASS =
  "inline-flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground outline-none hover:bg-accent hover:text-accent-foreground focus-visible:ring-2 focus-visible:ring-ring/70 disabled:pointer-events-none disabled:opacity-50 data-[state=open]:bg-accent [&_svg]:size-4";

function touchQuery() {
  return typeof window.matchMedia === "function" ? window.matchMedia(TOUCH_INPUT) : null;
}

function subscribeTouchInput(onChange: () => void) {
  const query = touchQuery();
  query?.addEventListener("change", onChange);
  return () => query?.removeEventListener("change", onChange);
}

function useTouchInput() {
  return useSyncExternalStore(
    subscribeTouchInput,
    () => touchQuery()?.matches ?? false,
    () => false,
  );
}

function isEditable(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement)
    return true;
  return (
    target instanceof HTMLInputElement &&
    !["button", "checkbox", "radio", "range", "reset", "submit", "color", "file"].includes(target.type)
  );
}

function isMenuKey(event: KeyboardEvent) {
  return event.key === "ContextMenu" || (event.shiftKey && event.key === "F10");
}

function hasContent(menu: ReactNode) {
  return menu !== undefined && menu !== null && menu !== false;
}

function localeFreeHref(href: string) {
  const split = href.search(/[?#]/);
  return split === -1 ? stripLocalePrefix(href) : stripLocalePrefix(href.slice(0, split)) + href.slice(split);
}

function ItemMenuItems({ href, menu }: { href?: string; menu?: ReactNode }) {
  const t = useTranslations();
  return (
    <>
      {href && (
        <DropdownMenuItem asChild>
          <IntlLink href={localeFreeHref(href)} prefetch={false} rel="noopener noreferrer" target="_blank">
            <ExternalLink aria-hidden />

            {t("Common.actions.openInNewTab")}
          </IntlLink>
        </DropdownMenuItem>
      )}

      {href && hasContent(menu) && <DropdownMenuSeparator />}

      {menu}
    </>
  );
}

type ItemActionsProps = Omit<ComponentProps<typeof ContextMenuTrigger>, "asChild" | "children"> & {
  children: ReactElement;
  label?: string;
  menu?: ReactNode;
  href?: string;
  longPress?: boolean;
  contentClassName?: string;
  onCloseAutoFocus?: CloseAutoFocus;
};

export function ItemActions({
  children,
  label,
  menu,
  href,
  longPress = true,
  contentClassName,
  onCloseAutoFocus,
  className,
  onContextMenu,
  onClickCapture,
  onContextMenuCapture,
  onKeyDown,
  onPointerDownCapture,
  onPointerUpCapture,
  onPointerCancelCapture,
  ...props
}: ItemActionsProps) {
  const registered = useRef<ItemMenu | null>(null);
  const registeredPresent = useRef(false);
  const [hasRegistered, setHasRegistered] = useState(false);
  const [shown, setShown] = useState<ItemMenu | null>(null);
  const keyboardOpenedAt = useRef(0);
  const pressOpenedAt = useRef(0);
  const pressing = useRef(false);
  const touch = useTouchInput();
  const register = useCallback((next: ItemMenu | null) => {
    registered.current = next;
    const present = next !== null;
    if (present === registeredPresent.current) return;
    registeredPresent.current = present;
    setHasRegistered(present);
  }, []);
  const own = hasContent(menu) ? { label, menu, onCloseAutoFocus } : null;
  const enabled = (own !== null || hasRegistered) && (longPress || !touch);
  const current = own ?? shown;

  const stopForEditable = (event: SyntheticEvent) => {
    if (isEditable(event.target)) event.stopPropagation();
  };

  return (
    <RegisterContext.Provider value={register}>
      <ItemActionsContext.Provider value={{ label, menu: own?.menu, href, contentClassName, onCloseAutoFocus }}>
        <ContextMenu
          onOpenChange={(open) => {
            if (!open) return;
            if (pressing.current) pressOpenedAt.current = Date.now();
            if (!own) setShown(registered.current);
          }}
        >
          <ContextMenuTrigger
            asChild
            className={cn(
              "group/item-actions touch-input:select-none touch-input:[&_:is(input,textarea,[contenteditable=true])]:select-text",
              className,
            )}
            data-disabled={undefined}
            data-item-actions=""
            data-state={undefined}
            disabled={!enabled}
            onClickCapture={(event) => {
              onClickCapture?.(event);
              if (Date.now() - pressOpenedAt.current > LONG_PRESS_CLICK_MS) return;
              pressOpenedAt.current = 0;
              event.preventDefault();
              event.stopPropagation();
            }}
            onContextMenu={(event) => {
              onContextMenu?.(event);
              if (
                event.nativeEvent.isTrusted &&
                event.button !== 2 &&
                Date.now() - keyboardOpenedAt.current < KEYBOARD_ECHO_MS
              )
                event.preventDefault();
            }}
            onContextMenuCapture={(event) => {
              onContextMenuCapture?.(event);
              stopForEditable(event);
            }}
            onKeyDown={(event) => {
              onKeyDown?.(event);
              if (event.defaultPrevented || !enabled || !isMenuKey(event) || isEditable(event.target)) return;
              if (!(event.target instanceof HTMLElement)) return;
              event.preventDefault();
              event.stopPropagation();
              const rect = event.target.getBoundingClientRect();
              keyboardOpenedAt.current = Date.now();
              event.target.dispatchEvent(
                new MouseEvent("contextmenu", {
                  bubbles: true,
                  cancelable: true,
                  clientX: rect.left,
                  clientY: rect.bottom,
                }),
              );
            }}
            onPointerCancelCapture={(event) => {
              onPointerCancelCapture?.(event);
              pressing.current = false;
            }}
            onPointerDownCapture={(event) => {
              onPointerDownCapture?.(event);
              if (event.pointerType === "mouse") return;
              pressing.current = true;
              stopForEditable(event);
            }}
            onPointerUpCapture={(event) => {
              onPointerUpCapture?.(event);
              pressing.current = false;
            }}
            {...props}
          >
            {children}
          </ContextMenuTrigger>

          <ContextMenuContent
            className={contentClassName}
            onCloseAutoFocus={(event) => {
              current?.onCloseAutoFocus?.(event);
              const active = document.activeElement;
              if (!event.defaultPrevented && active && active !== document.body && active.isConnected)
                event.preventDefault();
            }}
          >
            <ItemMenuItems href={href} menu={current?.menu} />
          </ContextMenuContent>
        </ContextMenu>
      </ItemActionsContext.Provider>
    </RegisterContext.Provider>
  );
}

type ItemActionsTriggerProps = {
  label?: string;
  menu?: ReactNode;
  trigger?: ReactElement<{ className?: string }>;
  ref?: Ref<HTMLButtonElement>;
  id?: string;
  className?: string;
  disabled?: boolean;
  tooltip?: boolean;
  align?: ComponentProps<typeof DropdownMenuContent>["align"];
  side?: ComponentProps<typeof DropdownMenuContent>["side"];
  contentClassName?: string;
  contentLabelledBy?: string;
  modal?: boolean;
  onCloseAutoFocus?: CloseAutoFocus;
};

export function ItemActionsTrigger({
  label,
  menu,
  trigger,
  ref,
  id,
  className,
  disabled,
  tooltip = true,
  align = "end",
  side,
  contentClassName,
  contentLabelledBy,
  modal,
  onCloseAutoFocus,
}: ItemActionsTriggerProps) {
  const register = useContext(RegisterContext);
  const area = useContext(ItemActionsContext);
  const owns = hasContent(menu);

  useLayoutEffect(() => {
    if (owns) register?.({ label, menu, onCloseAutoFocus });
  });
  useLayoutEffect(() => {
    if (!owns) return;
    return () => register?.(null);
  }, [owns, register]);

  const shownLabel = label ?? area?.label ?? "";
  const element = trigger ?? <button className={DEFAULT_TRIGGER_CLASS} type="button" />;
  const button = (
    <DropdownMenuTrigger asChild>
      {cloneElement(
        element,
        {
          ref,
          id,
          disabled,
          "aria-label": shownLabel,
          className: cn(element.props.className, ITEM_ACTIONS_TRIGGER_CLASS, className),
          "data-item-actions-trigger": "",
        } as Partial<{ className?: string }>,
        <Ellipsis aria-hidden />,
      )}
    </DropdownMenuTrigger>
  );

  return (
    <DropdownMenu modal={modal}>
      {tooltip ? (
        <Tooltip>
          <TooltipTrigger asChild>{button}</TooltipTrigger>

          <TooltipContent>{shownLabel}</TooltipContent>
        </Tooltip>
      ) : (
        button
      )}

      <DropdownMenuContent
        align={align}
        aria-labelledby={contentLabelledBy}
        className={contentClassName ?? area?.contentClassName}
        side={side}
        onCloseAutoFocus={owns ? onCloseAutoFocus : (onCloseAutoFocus ?? area?.onCloseAutoFocus)}
        onContextMenu={(event) => event.stopPropagation()}
        onPointerDown={(event) => event.stopPropagation()}
      >
        <ItemMenuItems href={area?.href} menu={owns ? menu : area?.menu} />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
