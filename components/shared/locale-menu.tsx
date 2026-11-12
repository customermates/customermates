"use client";

import type { MouseEvent as ReactMouseEvent } from "react";
import type { AppMode } from "@/core/config/environment";
import type { MarketingLocale } from "@/i18n/locale-registry";

import { useEffect, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { useNavigationGuard } from "@/core/stores/navigation-guard.context";
import { cn } from "@/core/utils/cn";
import { emojiFlag } from "@/core/utils/emoji-flag";
import {
  buildLocalePath,
  flagCodeFor,
  isContentLocale,
  marketingLocaleOrDefault,
  marketingLocalesForPath,
} from "@/i18n/locale-registry";
import { contentLocaleCookie } from "@/i18n/locale-preference";
import { usePathname } from "@/i18n/navigation";
import { preserveAdClickInHref } from "@/features/acquisition/ad-click-url";

const LIST_MAX_HEIGHT = 288;
const LIST_MIN_HEIGHT = 120;

type Props = {
  align?: "start" | "end";
  appMode: AppMode;
  className?: string;
  side?: "top" | "bottom";
};

export function LocaleMenu({ align = "start", appMode, className, side = "bottom" }: Props) {
  const t = useTranslations();
  const pathname = usePathname();
  const currentLocale = marketingLocaleOrDefault(useLocale());
  const offeredLocales = marketingLocalesForPath(pathname);
  const currentLocaleLabel = t(`Common.locales.${currentLocale}`);
  const navigationGuard = useNavigationGuard();
  const menuRef = useRef<HTMLDetailsElement>(null);
  const listRef = useRef<HTMLElement>(null);
  const [placement, setPlacement] = useState<{ maxHeight?: number; side: "top" | "bottom" }>({ side });

  useEffect(() => {
    function close() {
      if (menuRef.current) menuRef.current.open = false;
    }

    function closeOnOutsidePointer(event: PointerEvent) {
      const menu = menuRef.current;
      if (menu?.open && event.target instanceof Node && !menu.contains(event.target)) close();
    }

    function closeOnEscape(event: KeyboardEvent) {
      if (event.key !== "Escape" || !menuRef.current?.open) return;

      close();
      menuRef.current.querySelector("summary")?.focus();
    }

    document.addEventListener("pointerdown", closeOnOutsidePointer);
    document.addEventListener("keydown", closeOnEscape);

    return () => {
      document.removeEventListener("pointerdown", closeOnOutsidePointer);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, []);

  function handleSelect(event: ReactMouseEvent<HTMLAnchorElement>, locale: MarketingLocale) {
    if (isContentLocale(locale)) document.cookie = contentLocaleCookie(locale);
    const destination = preserveAdClickInHref(buildLocalePath(locale, pathname), {
      search: window.location.search,
    });
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) {
      event.currentTarget.href = destination;
      return;
    }

    event.preventDefault();
    if (menuRef.current) menuRef.current.open = false;
    if (locale === currentLocale) return;

    const navigate = () => {
      window.location.href = destination;
    };

    if (navigationGuard) navigationGuard.tryNavigate(navigate);
    else navigate();
  }

  function placeList() {
    const menu = menuRef.current;
    const summary = menu?.querySelector("summary");
    if (!menu?.open || !summary) return;

    const gap = 8;
    const rect = summary.getBoundingClientRect();
    const viewportHeight = window.visualViewport?.height ?? window.innerHeight;
    const below = viewportHeight - rect.bottom - gap;
    const above = rect.top - gap;
    const wanted = Math.min(listRef.current?.scrollHeight ?? LIST_MAX_HEIGHT, LIST_MAX_HEIGHT);
    const preferred = side === "top" ? above : below;
    const other = side === "top" ? below : above;
    const next = preferred >= wanted || preferred >= other ? side : side === "top" ? "bottom" : "top";
    const room = next === "top" ? above : below;

    setPlacement({ maxHeight: Math.max(LIST_MIN_HEIGHT, Math.min(LIST_MAX_HEIGHT, room)), side: next });
  }

  function preservePendingClick(event: ReactMouseEvent<HTMLAnchorElement>, locale: MarketingLocale) {
    event.currentTarget.href = preserveAdClickInHref(buildLocalePath(locale, pathname), {
      search: window.location.search,
    });
  }

  return (
    <details ref={menuRef} className={cn("relative", className)} onToggle={placeList}>
      <Button
        asChild
        className="size-8 rounded-md p-0 text-subdued hover:text-foreground [&::-webkit-details-marker]:hidden"
        size="icon-sm"
        variant="ghost"
      >
        <summary
          aria-label={`${t("Common.language")}: ${currentLocaleLabel}`}
          className="list-none"
          title={currentLocaleLabel}
        >
          <span aria-hidden>{currentLocale.toUpperCase()}</span>
        </summary>
      </Button>

      <nav
        ref={listRef}
        aria-label={t("Common.language")}
        className={cn(
          "absolute z-50 max-h-72 min-w-44 overflow-y-auto overscroll-contain rounded-md border border-border-strong bg-popover p-1 text-popover-foreground shadow-md",
          placement.side === "top" ? "bottom-full mb-1" : "top-full mt-1",
          align === "end" ? "right-0" : "left-0",
        )}
        style={placement.maxHeight ? { maxHeight: placement.maxHeight } : undefined}
      >
        {offeredLocales.map((locale) => {
          const label = t(`Common.locales.${locale}`);
          const isSelected = locale === currentLocale;

          return (
            <a
              key={locale}
              aria-current={isSelected ? "true" : undefined}
              className={cn(
                "flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm no-underline transition-colors hover:bg-accent focus-visible:bg-accent",
                isSelected && "bg-accent",
              )}
              data-selected={isSelected}
              href={buildLocalePath(locale, pathname)}
              hrefLang={locale}
              onAuxClick={(event) => preservePendingClick(event, locale)}
              onClick={(event) => handleSelect(event, locale)}
              onContextMenu={(event) => preservePendingClick(event, locale)}
            >
              {appMode === "self-hosted" ? (
                <span aria-hidden className="grid size-5 shrink-0 place-items-center leading-none">
                  {emojiFlag(flagCodeFor(locale))}
                </span>
              ) : (
                // eslint-disable-next-line @next/next/no-img-element -- a lazy flag inside a closed disclosure must not be requested, which next/image cannot express.
                <img
                  aria-hidden
                  alt={label}
                  className="size-5 shrink-0 rounded-full object-cover"
                  height={20}
                  loading="lazy"
                  src={`https://flagcdn.com/${flagCodeFor(locale).toLowerCase()}.svg`}
                  width={20}
                  onError={(event) => {
                    event.currentTarget.style.visibility = "hidden";
                  }}
                />
              )}

              <span className="truncate">{label}</span>
            </a>
          );
        })}
      </nav>
    </details>
  );
}
