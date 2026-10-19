import type { SetupAnswerValue, SetupAnswers } from "@/features/workspace-setup/setup-answers.schema";
import type { SetupScreen } from "@/features/workspace-setup/setup-interview";
import type { SetupQuestionDescriptor } from "./setup-question-descriptor";

import { getCurrencyLabel } from "@/constants/currencies";

import { partDescriptor } from "./setup-question-descriptor";
import { visibleScreenParts } from "./setup-interview-state";

type Translate = (key: string) => string;

function labels(descriptor: SetupQuestionDescriptor, ids: string[]): string[] {
  const options = "options" in descriptor ? descriptor.options : [];
  return ids.flatMap((id) => options.find((option) => option.id === id)?.label ?? []);
}

function answerSummary(
  descriptor: SetupQuestionDescriptor,
  value: SetupAnswerValue | null | undefined,
  locale: string,
  t: Translate,
  currency: string | null = null,
): string | null {
  if (!value) return null;
  switch (value.format) {
    case "singleChoice": {
      if (descriptor.format !== "singleChoice") return null;
      if (descriptor.optionSource === "countries")
        return new Intl.DisplayNames([locale], { type: "region" }).of(value.value) ?? value.value;
      if (descriptor.optionSource === "currencies") return getCurrencyLabel(value.value, locale);
      if (descriptor.optionSource === "locales") return t(`Common.locales.${value.value}`);
      return labels(descriptor, [value.value])[0] ?? null;
    }
    case "multipleChoice":
      return [...labels(descriptor, value.values), ...value.custom].join(", ") || null;
    case "rankedPick":
      return labels(descriptor, value.values).join(", ") || null;
    case "orderedList":
      return value.items.map((item) => item.label).join(" → ") || null;
    case "range": {
      const range = value.max === null || value.max === value.min ? String(value.min) : `${value.min}–${value.max}`;
      if (descriptor.format !== "range") return range;
      return descriptor.unit === "days"
        ? `${range} ${t("WorkspaceSetup.interview.days")}`
        : `${range} ${currency ? getCurrencyLabel(currency, locale) : ""}`.trim();
    }
    case "shortText":
      return value.value.trim() || null;
  }
}

export function screenSummary(
  screen: SetupScreen,
  answers: SetupAnswers,
  locale: string,
  currency: string | null,
  t: Translate,
): string {
  return visibleScreenParts(screen, answers)
    .flatMap(
      (part) => answerSummary(partDescriptor(part, t, answers), answers[part.id]?.value, locale, t, currency) ?? [],
    )
    .join(" · ");
}
