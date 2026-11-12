import type { PublicQuestion } from "./booking.schema";

export type CheckedAnswers = {
  invalid: string[];
  values: Array<{ fieldId: string; value: string | number | boolean }>;
};

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function isEmpty(value: unknown): boolean {
  return value === undefined || value === null || (typeof value === "string" && !value.trim());
}

function accepts(question: PublicQuestion, value: unknown): value is string | number | boolean {
  switch (question.kind) {
    case "text":
      return typeof value === "string";
    case "url":
      return typeof value === "string" && isHttpUrl(value.trim());
    case "select":
      return typeof value === "string" && question.options.some((option) => option.id === value);
    case "number":
      return typeof value === "number" && Number.isFinite(value);
    case "boolean":
      return typeof value === "boolean";
    case "date":
      return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
  }
}

export function checkBookingAnswers(
  questions: PublicQuestion[],
  answers: Record<string, string | number | boolean>,
): CheckedAnswers {
  const result: CheckedAnswers = { invalid: [], values: [] };

  for (const question of questions) {
    const value = answers[question.fieldId];
    const missing = isEmpty(value) || (question.kind === "boolean" && value === false);
    if (missing) {
      if (question.required) result.invalid.push(question.fieldId);
      continue;
    }
    if (!accepts(question, value)) {
      result.invalid.push(question.fieldId);
      continue;
    }
    result.values.push({ fieldId: question.fieldId, value: typeof value === "string" ? value.trim() : value });
  }

  return result;
}

export function describeBookingAnswers(
  questions: PublicQuestion[],
  values: CheckedAnswers["values"],
): Array<{ label: string; text: string }> {
  return values.flatMap(({ fieldId, value }) => {
    const question = questions.find((item) => item.fieldId === fieldId);
    if (!question) return [];
    const option = question.options.find((item) => item.id === value);

    return [{ label: question.label, text: option ? option.label : typeof value === "boolean" ? "✓" : String(value) }];
  });
}
