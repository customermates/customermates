import type { $ZodIssue, ParseContext } from "zod/v4/core";
import type { ZodLocaleModule } from "./validation.types";

import { getLocale, getTranslations } from "next-intl/server";

import { createErrorHandler } from "./validation.utils";
import { CustomErrorCode } from "./validation.types";

import { appLocaleOrDefault, validationTagFor } from "@/i18n/locale-registry";

export async function getZodParseContext(): Promise<ParseContext<$ZodIssue>> {
  const locale = await getLocale();
  const appLocale = appLocaleOrDefault(locale);
  const t = await getTranslations();

  const customErrorTranslations = Object.fromEntries(
    Object.values(CustomErrorCode).map((code) => [code, t.raw(`Common.errors.${code}`) as string]),
  );

  const localeModule: ZodLocaleModule = await import(`zod/v4/locales/${validationTagFor(appLocale)}.js`);
  const localeConfig = localeModule.default();

  const customError = createErrorHandler(customErrorTranslations);

  return {
    error: (issue) => customError(issue) ?? localeConfig.localeError(issue),
  };
}
