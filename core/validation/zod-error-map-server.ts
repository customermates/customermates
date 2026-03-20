import type { ZodLocaleModule } from "./validation.types";

import { getLocale, getTranslations } from "next-intl/server";
import { z } from "zod";

import { createErrorHandler } from "./validation.utils";
import { CustomErrorCode } from "./validation.types";

export async function configureZodLocale(): Promise<void> {
  const locale = await getLocale();
  const zodLocale = locale === "de" ? "de" : "en";
  const t = await getTranslations("Common");

  const customErrorTranslations = Object.fromEntries(
    Object.values(CustomErrorCode).map((code) => [code, t.raw(`errors.${code}`) as string]),
  );

  const localeModule: ZodLocaleModule = await import(`zod/v4/locales/${zodLocale}.js`);
  const localeConfig = localeModule.default();

  z.config({
    localeError: localeConfig.localeError,
    customError: createErrorHandler(customErrorTranslations),
  });
}
