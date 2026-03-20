"use client";

import type { SharedSelection } from "@heroui/system-rsc";

import { useLocale, useTranslations } from "next-intl";
import { observer } from "mobx-react-lite";
import { Avatar } from "@heroui/avatar";
import { cn } from "@heroui/theme";

import { usePathname } from "@/i18n/navigation";
import { ROUTING_LOCALES } from "@/i18n/routing";
import { XSelect } from "@/components/x-inputs/x-select";
import { XSelectItem } from "@/components/x-inputs/x-select-item";

type Locale = (typeof ROUTING_LOCALES)[number];
type Props = {
  className?: string;
};

const LOCALE_TO_FLAG: Record<Locale, string> = {
  de: "de",
  en: "us",
};

export const XLanguageSelector = observer(({ className }: Props) => {
  const t = useTranslations("Common");
  const pathname = usePathname();
  const currentLocale = useLocale() as Locale;
  const localeItems = ROUTING_LOCALES.map((locale) => ({
    key: locale,
    label: t(`locales.${locale}`),
  }));
  const currentLocaleLabel = t(`locales.${currentLocale}`);

  function onSelectionChange(selection: SharedSelection) {
    if (selection === "all") return;
    const locale = String(Array.from(selection)[0]) as Locale;
    if (!locale) return;
    if (locale === currentLocale) return;
    const newPath = `/${locale}${pathname}`;
    window.location.href = newPath;
  }

  return (
    <XSelect
      key={currentLocale}
      disallowEmptySelection
      aria-label={t("language")}
      className={cn("min-w-32", className)}
      classNames={{ trigger: "h-8 min-h-8", value: "text-sm", selectorIcon: "text-subdued" }}
      id="language"
      items={localeItems}
      label={null}
      size="sm"
      startContent={
        <Avatar
          alt={t("imageAlt.countryFlag", { country: currentLocaleLabel })}
          className="h-4 w-4 shrink-0"
          src={`https://flagcdn.com/${LOCALE_TO_FLAG[currentLocale].toLowerCase()}.svg`}
        />
      }
      value={currentLocale}
      onSelectionChange={onSelectionChange}
    >
      {(item) =>
        XSelectItem({
          key: item.key,
          textValue: item.label,
          children: (
            <div className="flex items-center gap-2">
              <Avatar
                alt={t("imageAlt.countryFlag", { country: item.label })}
                className="h-4 w-4"
                src={`https://flagcdn.com/${LOCALE_TO_FLAG[item.key].toLowerCase()}.svg`}
              />

              <span>{item.label}</span>
            </div>
          ),
        })
      }
    </XSelect>
  );
});
