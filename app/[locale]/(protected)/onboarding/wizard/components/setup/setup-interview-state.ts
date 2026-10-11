import type { SetupAnswer, SetupAnswerValue, SetupAnswers } from "@/features/workspace-setup/setup-answers.schema";
import type { SetupQuestion, SetupQuestionPart, SetupScreen } from "@/features/workspace-setup/setup-interview";
import type { WorkspaceSetupStatusView, WorkspaceSetupView } from "@/ee/workspace-setup/workspace-setup-status";
import type { SetupFollowUpQuestion } from "@/ee/workspace-setup/workspace-setup.schema";

import { SETUP_QUESTIONS, SETUP_SCREENS } from "@/features/workspace-setup/setup-interview";
import { mergeWebsitePrefill } from "@/features/workspace-setup/setup-prefill";

export type SetupStage =
  | "unavailable"
  | "start"
  | "interview"
  | "followUps"
  | "planning"
  | "planFailed"
  | "plan"
  | "build"
  | "done";

const SINGLE_CHOICE_COVERS: Readonly<Record<string, readonly string[]>> = { both: ["businesses", "consumers"] };

export function unansweredFollowUps(setup: WorkspaceSetupView) {
  const { followUpQuestions, followUpAnswers } = setup.interview;
  return followUpQuestions.filter((question) => !followUpAnswers.some((answer) => answer.id === question.id));
}

export function resolveSetupStage(view: WorkspaceSetupStatusView | null): SetupStage {
  if (!view?.available) return "unavailable";
  const setup = view.setup;
  if (!setup) return "start";
  switch (setup.status) {
    case "interview":
      if (setup.interview.followUps === "completed" && unansweredFollowUps(setup).length > 0) return "followUps";
      return setup.plan.status === "failed" ? "planFailed" : "interview";
    case "planning":
      return "planning";
    case "planned":
      return "plan";
    case "building":
    case "completed":
    case "failed":
      return "build";
    case "rolledBack":
      return "done";
  }
}

export function partVisible(part: SetupQuestionPart, answers: SetupAnswers): boolean {
  if (!part.visibleWhen) return true;
  const { part: parentId, includes } = part.visibleWhen;
  const value = answers[parentId]?.value;
  if (value?.format === "multipleChoice") return value.values.includes(includes);
  if (value?.format === "singleChoice")
    return value.value === includes || (SINGLE_CHOICE_COVERS[value.value]?.includes(includes) ?? false);
  return false;
}

export function screenQuestions(screen: SetupScreen): SetupQuestion[] {
  return SETUP_QUESTIONS.filter((question) => question.screen === screen);
}

export function visibleScreenParts(screen: SetupScreen, answers: SetupAnswers): SetupQuestionPart[] {
  return screenQuestions(screen)
    .flatMap((question) => question.parts)
    .filter((part) => partVisible(part, answers));
}

export function defaultAnswerValue(part: SetupQuestionPart, locale: string): SetupAnswerValue | null {
  switch (part.format) {
    case "multipleChoice":
      return {
        format: "multipleChoice",
        values: part.options.filter((option) => option.preselected).map((option) => option.id),
        custom: [],
      };
    case "orderedList":
      return { format: "orderedList", items: [] };
    case "shortText":
      return { format: "shortText", value: "" };
    case "singleChoice":
      return part.optionSource === "locales" ? { format: "singleChoice", value: locale } : null;
    case "rankedPick":
    case "range":
      return null;
  }
}

export function displayedAnswerValue(
  part: SetupQuestionPart,
  answers: SetupAnswers,
  locale: string,
): SetupAnswerValue | null {
  return answers[part.id]?.value ?? defaultAnswerValue(part, locale);
}

export function sanitizeAnswerValue(value: SetupAnswerValue): SetupAnswerValue {
  switch (value.format) {
    case "orderedList":
      return {
        format: "orderedList",
        items: value.items
          .map((item) => ({ ...item, label: item.label.trim() }))
          .filter((item) => item.label.length > 0),
      };
    case "shortText":
      return { format: "shortText", value: value.value.trim() };
    default:
      return value;
  }
}

export function answerIsEmpty(value: SetupAnswerValue | null): boolean {
  if (!value) return true;
  switch (value.format) {
    case "singleChoice":
    case "shortText":
      return value.value.trim().length === 0;
    case "orderedList":
      return !value.items.some((item) => item.label.trim().length > 0);
    case "rankedPick":
      return value.values.length === 0;
    case "multipleChoice":
      return value.values.length === 0 && value.custom.length === 0;
    case "range":
      return false;
  }
}

export function answerComplete(
  part: Pick<SetupQuestionPart, "format" | "optional">,
  value: SetupAnswerValue | null,
): boolean {
  if (part.optional) return true;
  if (!value) return false;
  if (value.format === "multipleChoice") return true;
  return !answerIsEmpty(value);
}

export function screenComplete(screen: SetupScreen, answers: SetupAnswers, locale: string): boolean {
  return visibleScreenParts(screen, answers).every((part) =>
    answerComplete(part, displayedAnswerValue(part, answers, locale)),
  );
}

export function screenAnswersPayload(
  screen: SetupScreen,
  answers: SetupAnswers,
  locale: string,
): Partial<Record<string, SetupAnswerValue | null>> {
  const payload: Partial<Record<string, SetupAnswerValue | null>> = {};
  for (const part of screenQuestions(screen).flatMap((question) => question.parts)) {
    if (!partVisible(part, answers)) {
      if (answers[part.id]) payload[part.id] = null;
      continue;
    }
    const value = displayedAnswerValue(part, answers, locale);
    if (part.optional && answerIsEmpty(value)) {
      if (answers[part.id]) payload[part.id] = null;
      continue;
    }
    if (value) payload[part.id] = sanitizeAnswerValue(value);
  }
  return payload;
}

export function resumeScreenIndex(answers: SetupAnswers): number {
  const index = SETUP_SCREENS.findIndex((screen) =>
    visibleScreenParts(screen, answers).some((part) => !part.optional && answers[part.id]?.source !== "user"),
  );
  return index === -1 ? SETUP_SCREENS.length - 1 : index;
}

export function mergeServerAnswers(
  local: SetupAnswers,
  touched: ReadonlySet<string>,
  server: SetupAnswers,
): SetupAnswers {
  const confirmed: SetupAnswers = {};
  for (const [id, answer] of Object.entries(server))
    if (answer && answer.source === "user" && !touched.has(id)) confirmed[id] = answer;
  for (const id of touched) {
    const answer: SetupAnswer | undefined = local[id];
    if (answer) confirmed[id] = answer;
  }
  return mergeWebsitePrefill(confirmed, server);
}

export function answerFromWebsite(answers: SetupAnswers, id: string): boolean {
  return answers[id]?.source === "website";
}

export function defaultFollowUpValue(question: SetupFollowUpQuestion): SetupAnswerValue | null {
  switch (question.format) {
    case "multipleChoice":
      return { format: "multipleChoice", values: [], custom: [] };
    case "orderedList":
      return { format: "orderedList", items: question.suggestions.map((label) => ({ label })) };
    case "shortText":
      return { format: "shortText", value: "" };
    case "singleChoice":
    case "rankedPick":
    case "range":
      return null;
  }
}

export function displayedFollowUpValue(
  question: SetupFollowUpQuestion,
  setup: WorkspaceSetupView,
  drafts: Readonly<Record<string, SetupAnswerValue>>,
): SetupAnswerValue | null {
  return (
    drafts[question.id] ??
    setup.interview.followUpAnswers.find((answer) => answer.id === question.id)?.value ??
    defaultFollowUpValue(question)
  );
}
