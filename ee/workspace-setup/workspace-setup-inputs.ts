import type { AppLocale } from "@/i18n/locale-registry";
import type { SetupAnswers } from "@/features/workspace-setup/setup-answers.schema";
import type { UpdateUserDetailsData } from "@/features/user/upsert/update-user-details.interactor";
import type { TeamSize } from "@/features/onboarding-funnel/team-size";

import { isFormattingLocale, appLocaleOrDefault } from "@/i18n/locale-registry";

type SetupDataChoice = "sampleData" | "empty";

export function setupLanguage(answers: SetupAnswers, fallback: string | null = null): AppLocale {
  const value = answers.language?.value;
  return appLocaleOrDefault(value?.format === "singleChoice" ? value.value : fallback);
}

export function setupCurrency(answers: SetupAnswers): string | null {
  const value = answers.currency?.value;
  return value?.format === "singleChoice" && /^[A-Z]{3}$/.test(value.value) ? value.value : null;
}

export function setupCompanySettings(answers: SetupAnswers): Pick<UpdateUserDetailsData, "formattingLocale"> {
  const language = answers.language?.value;
  return {
    ...(language?.format === "singleChoice" && isFormattingLocale(language.value)
      ? { formattingLocale: language.value }
      : {}),
  };
}

export function setupTeamSize(teamSize: TeamSize | null): "solo" | "small" | "large" | null {
  if (teamSize === null || teamSize === "solo" || teamSize === "small") return teamSize;
  return "large";
}

export function setupDataChoice(answers: SetupAnswers): SetupDataChoice {
  const value = answers.existingData?.value;
  return value?.format === "singleChoice" && value.value === "empty" ? "empty" : "sampleData";
}

export function answersForPrompt(answers: SetupAnswers) {
  return Object.entries(answers).flatMap(([part, answer]) => (answer ? [{ part, value: answer.value }] : []));
}
