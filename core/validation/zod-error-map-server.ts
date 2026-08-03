import type { ZodLocaleModule } from "./validation.types";

import { getLocale, getTranslations } from "next-intl/server";
import { z } from "zod";

import { createErrorHandler } from "./validation.utils";
import { CustomErrorCode } from "./validation.types";

import { appLocaleOrDefault } from "@/i18n/locale-registry";

export async function configureZodLocale(): Promise<void> {
  const locale = await getLocale();
  const zodLocale = appLocaleOrDefault(locale);
  const t = await getTranslations();

  const customErrorTranslations = Object.fromEntries(
    Object.values(CustomErrorCode).map((code) => [code, t.raw(`Common.errors.${code}`) as string]),
  );

  const localeModule: ZodLocaleModule = await import(`zod/v4/locales/${zodLocale}.js`);
  const localeConfig = localeModule.default();

  z.config({
    localeError: localeConfig.localeError,
    customError: createErrorHandler(customErrorTranslations),
  });
}
