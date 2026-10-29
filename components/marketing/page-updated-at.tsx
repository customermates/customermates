import { getTranslations } from "next-intl/server";

import { formattingTagFor, marketingLocaleOrDefault } from "@/i18n/locale-registry";

export async function PageUpdatedAt({ date, locale }: { date: Date | undefined; locale: string }) {
  if (!date) return null;

  const displayLocale = marketingLocaleOrDefault(locale);
  const t = await getTranslations({ locale: displayLocale });

  return (
    <time dateTime={date.toISOString()}>
      {t("Common.updatedOn", {
        date: date.toLocaleDateString(formattingTagFor(displayLocale), {
          year: "numeric",
          month: "long",
          day: "numeric",
          timeZone: "UTC",
        }),
      })}
    </time>
  );
}
