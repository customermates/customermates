import type { AbstractIntlMessages } from "next-intl";

const UNREPORTED_ERROR_MESSAGES = "WithoutErrorReporting";

function isMessages(value: unknown): value is AbstractIntlMessages {
  return typeof value === "object" && value !== null;
}

function overlay(base: AbstractIntlMessages, override: AbstractIntlMessages): AbstractIntlMessages {
  return Object.fromEntries(
    Object.entries({ ...base, ...override }).map(([key, value]) => {
      const baseValue = base[key];
      return [key, isMessages(baseValue) && isMessages(value) ? overlay(baseValue, value) : value];
    }),
  );
}

export function messagesForErrorReporting(
  messages: AbstractIntlMessages,
  errorsReported: boolean,
): AbstractIntlMessages {
  const { [UNREPORTED_ERROR_MESSAGES]: unreported, ...rest } = messages;

  return errorsReported || !isMessages(unreported) ? rest : overlay(rest, unreported);
}
