import type { $ZodIssue, $ZodRawIssue, ParseContext } from "zod/v4/core";
import type { ZodLocaleModule } from "./validation.types";

import { getTranslations } from "next-intl/server";

import { createErrorHandler } from "./validation.utils";
import { CustomErrorCode } from "./validation.types";

import { getTranslator } from "@/i18n/get-translator";
import { appLocaleOrDefault, validationTagFor, type AppLocale } from "@/i18n/locale-registry";
import { getRequestAppLocale } from "@/i18n/request-app-locale";

type MessageReader = { raw: (key: string) => unknown };

async function localization(): Promise<{ appLocale: AppLocale; messages: MessageReader }> {
  try {
    return { appLocale: await getRequestAppLocale(), messages: await getTranslations() };
  } catch {
    const appLocale = appLocaleOrDefault(undefined);
    return { appLocale, messages: await getTranslator(appLocale) };
  }
}

function invalidFormatError(issue: $ZodRawIssue, errors: Record<string, string>): string | undefined {
  if (issue.code !== "invalid_format") return undefined;
  if (issue.format === "email") return errors[CustomErrorCode.invalidEmail];
  if (issue.format === "url") return errors[CustomErrorCode.invalidUrl];
  return undefined;
}

export async function getZodParseContext(): Promise<ParseContext<$ZodIssue>> {
  const { appLocale, messages: t } = await localization();

  const customErrorTranslations = Object.fromEntries(
    Object.values(CustomErrorCode).map((code) => [code, t.raw(`Common.errors.${code}`) as string]),
  );

  const localeModule: ZodLocaleModule = await import(`zod/v4/locales/${validationTagFor(appLocale)}.js`);
  const localeConfig = localeModule.default();

  const customError = createErrorHandler(customErrorTranslations);

  return {
    error: (issue) =>
      customError(issue) ?? invalidFormatError(issue, customErrorTranslations) ?? localeConfig.localeError(issue),
  };
}
