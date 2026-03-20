"use client";

import type { ZodLocaleModule } from "./validation.types";

import { useLocale, useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { z } from "zod";

import { createErrorHandler } from "./validation.utils";
import { CustomErrorCode } from "./validation.types";

let isConfigured = false;

export function useZodErrorMap() {
  const locale = useLocale();
  const t = useTranslations("Common");
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    if (isConfigured) {
      setIsReady(true);
      return;
    }

    const zodLocale = locale === "de" ? "de" : "en";
    const customErrorTranslations = Object.fromEntries(
      Object.values(CustomErrorCode).map((code) => [code, t.raw(`errors.${code}`) as string]),
    );

    import(`zod/v4/locales/${zodLocale}.js`)
      .then((localeModule: ZodLocaleModule) => {
        const localeConfig = localeModule.default();

        z.config({
          localeError: localeConfig.localeError,
          customError: createErrorHandler(customErrorTranslations),
        });

        isConfigured = true;
        setIsReady(true);
      })
      .catch(() => {
        setIsReady(true);
      });
  }, [locale, t]);

  return { isReady };
}
