"use client";

import type { MouseEvent as ReactMouseEvent } from "react";
import type { ContentLocale } from "@/i18n/locale-registry";

import { useEffect, useRef } from "react";
import { observer } from "mobx-react-lite";
import { useLocale, useTranslations } from "next-intl";

import { FormAutocompleteCountryItem } from "@/components/forms/form-autocomplete-country-item";
import { Button } from "@/components/ui/button";
import { useRootStore } from "@/core/stores/root-store.provider";
import { cn } from "@/core/utils/cn";
import { CONTENT_LOCALES, buildLocalePath, contentLocaleOrDefault, flagCodeFor } from "@/i18n/locale-registry";
import { usePathname } from "@/i18n/navigation";
import { preserveAdClickInHref } from "@/features/acquisition/ad-attribution.schema";

type Props = {
  align?: "start" | "end";
  className?: string;
  side?: "top" | "bottom";
};

export const LocaleMenu = observer(({ align = "start", className, side = "bottom" }: Props) => {
  const t = useTranslations();
  const pathname = usePathname();
  const currentLocale = contentLocaleOrDefault(useLocale());
  const currentLocaleLabel = t(`Common.locales.${currentLocale}`);
  const { navigationGuard } = useRootStore();
  const menuRef = useRef<HTMLDetailsElement>(null);

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

  function handleSelect(event: ReactMouseEvent<HTMLAnchorElement>, locale: ContentLocale) {
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

    navigationGuard.tryNavigate(() => {
      window.location.href = destination;
    });
  }

  function preservePendingClick(event: ReactMouseEvent<HTMLAnchorElement>, locale: ContentLocale) {
    event.currentTarget.href = preserveAdClickInHref(buildLocalePath(locale, pathname), {
      search: window.location.search,
    });
  }

  return (
    <details ref={menuRef} className={cn("relative", className)}>
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
        aria-label={t("Common.language")}
        className={cn(
          "absolute z-50 max-h-72 min-w-44 overflow-y-auto overscroll-contain rounded-md border border-border-strong bg-popover p-1 text-popover-foreground shadow-md",
          side === "top" ? "bottom-full mb-1" : "top-full mt-1",
          align === "end" ? "right-0" : "left-0",
        )}
      >
        {CONTENT_LOCALES.map((locale) => {
          const label = t(`Common.locales.${locale}`);
          const isSelected = locale === currentLocale;

          return (
            <a
              key={locale}
              aria-current={isSelected ? "true" : undefined}
              className={cn(
                "flex w-full items-center rounded-sm px-2 py-1.5 text-sm no-underline transition-colors hover:bg-accent focus-visible:bg-accent",
                isSelected && "bg-accent",
              )}
              data-selected={isSelected}
              href={buildLocalePath(locale, pathname)}
              hrefLang={locale}
              onAuxClick={(event) => preservePendingClick(event, locale)}
              onClick={(event) => handleSelect(event, locale)}
              onContextMenu={(event) => preservePendingClick(event, locale)}
            >
              <FormAutocompleteCountryItem countryKey={flagCodeFor(locale)} label={label} />
            </a>
          );
        })}
      </nav>
    </details>
  );
});
