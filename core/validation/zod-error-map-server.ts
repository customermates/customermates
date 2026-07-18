import { getLocale, getTranslations } from "next-intl/server";
import { z } from "zod";
import de from "zod/v4/locales/de.js";
import en from "zod/v4/locales/en.js";

import { createErrorHandler } from "./validation.utils";
import { CustomErrorCode } from "./validation.types";

export async function configureZodLocale(): Promise<void> {
  const locale = await getLocale();
  const t = await getTranslations();

  const customErrorTranslations = Object.fromEntries(
    Object.values(CustomErrorCode).map((code) => [code, t.raw(`Common.errors.${code}`) as string]),
  );

  const localeConfig = locale === "de" ? de() : en();

  z.config({
    localeError: localeConfig.localeError,
    customError: createErrorHandler(customErrorTranslations),
  });
}
