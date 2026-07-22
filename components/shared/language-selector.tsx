"use client";

import { useLocale, useTranslations } from "next-intl";
import { observer } from "mobx-react-lite";
import { ChevronDownIcon } from "lucide-react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { usePathname } from "@/i18n/navigation";
import { ROUTING_LOCALES } from "@/i18n/routing";
import { useRootStore } from "@/core/stores/root-store.provider";
import { cn } from "@/core/utils/cn";

type Locale = (typeof ROUTING_LOCALES)[number];

type Props = {
  className?: string;
};

const LOCALE_TO_FLAG: Record<Locale, string> = {
  de: "de",
  en: "us",
};

export const LanguageSelector = observer(({ className }: Props) => {
  const t = useTranslations();
  const pathname = usePathname();
  const currentLocale = useLocale() as Locale;
  const currentLocaleLabel = t(`Common.locales.${currentLocale}`);
  const { navigationGuard } = useRootStore();

  function handleSelect(locale: Locale) {
    if (locale === currentLocale) return;
    navigationGuard.tryNavigate(() => {
      window.location.href = `/${locale}${pathname}`;
    });
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          aria-label={t("Common.language")}
          className={cn("min-w-32 h-8 justify-between gap-2", className)}
          size="sm"
          variant="outline"
        >
          <span className="flex items-center gap-2">
            <Avatar size="sm">
              <AvatarImage
                alt={t("Common.imageAlt.countryFlag", {
                  country: currentLocaleLabel,
                })}
                loading="lazy"
                src={`https://flagcdn.com/${LOCALE_TO_FLAG[currentLocale].toLowerCase()}.svg`}
              />

              <AvatarFallback>{currentLocale.toUpperCase()}</AvatarFallback>
            </Avatar>

            <span className="text-sm">{currentLocaleLabel}</span>
          </span>

          <ChevronDownIcon className="size-4 text-muted-foreground" />
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="start" className="min-w-32">
        {ROUTING_LOCALES.map((locale) => {
          const label = t(`Common.locales.${locale}`);
          return (
            <DropdownMenuItem key={locale} onSelect={() => handleSelect(locale)}>
              <Avatar size="sm">
                <AvatarImage
                  alt={t("Common.imageAlt.countryFlag", { country: label })}
                  src={`https://flagcdn.com/${LOCALE_TO_FLAG[locale].toLowerCase()}.svg`}
                />

                <AvatarFallback>{locale.toUpperCase()}</AvatarFallback>
              </Avatar>

              <span>{label}</span>
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
});
