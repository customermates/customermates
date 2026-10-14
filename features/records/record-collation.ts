import { Prisma } from "@/generated/prisma";
import { DEFAULT_LOCALE, isFormattingLocale, type FormattingLocale } from "@/i18n/locale-registry";

export function recordCollation(locale: FormattingLocale = DEFAULT_LOCALE): Prisma.Sql {
  if (!isFormattingLocale(locale)) throw new Error("Unsupported record collation locale");
  return Prisma.raw(`"crm_${locale}"`);
}
