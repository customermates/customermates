"use client";

import { observer } from "mobx-react-lite";
import { useLocale, useTranslations } from "next-intl";

import { FormAutocompleteCountryItem } from "@/components/forms/form-autocomplete-country-item";
import { FormAutocompleteItem } from "@/components/forms/form-autocomplete-item";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useRootStore } from "@/core/stores/root-store.provider";
import { cn } from "@/core/utils/cn";
import { CONTENT_LOCALES, flagCodeFor, type ContentLocale } from "@/i18n/locale-registry";
import { usePathname } from "@/i18n/navigation";

type Props = {
  className?: string;
};

export const LanguageSelector = observer(({ className }: Props) => {
  const t = useTranslations();
  const pathname = usePathname();
  const currentLocale = useLocale() as ContentLocale;
  const currentLocaleLabel = t(`Common.locales.${currentLocale}`);
  const { navigationGuard } = useRootStore();

  function handleSelect(locale: ContentLocale) {
    if (locale === currentLocale) return;
    navigationGuard.tryNavigate(() => {
      window.location.href = `/${locale}${pathname}`;
    });
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          aria-label={`${t("Common.language")}: ${currentLocaleLabel}`}
          className={cn("size-8 rounded-md p-0 text-subdued", className)}
          size="icon-sm"
          title={currentLocaleLabel}
          variant="ghost"
        >
          <span aria-hidden>{currentLocale.toUpperCase()}</span>
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="start" className="min-w-40">
        {CONTENT_LOCALES.map((locale) => {
          const label = t(`Common.locales.${locale}`);
          const isSelected = locale === currentLocale;
          return (
            <DropdownMenuItem
              key={locale}
              aria-checked={isSelected}
              className={cn(isSelected && "bg-accent")}
              data-selected={isSelected}
              role="menuitemradio"
              onSelect={() => handleSelect(locale)}
            >
              {FormAutocompleteItem({
                textValue: label,
                children: <FormAutocompleteCountryItem countryKey={flagCodeFor(locale)} label={label} />,
              })}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
});
