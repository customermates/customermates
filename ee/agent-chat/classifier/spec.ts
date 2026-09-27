export type ClassifierJson = string | number | boolean | null | ClassifierJson[] | { [key: string]: ClassifierJson };

export type ClassifierState = { [key: string]: ClassifierJson };

export type ClassifierChoiceQuestion = {
  id: string;
  type: "choice";
  instruction: string;
  options: Readonly<Record<string, string>>;
};

export type ClassifierBooleanQuestion = {
  id: string;
  type: "boolean";
  instruction: string;
  criteria?: { true: string; false: string };
};

export type ClassifierQuestion = ClassifierChoiceQuestion | ClassifierBooleanQuestion;

export type ClassifierSpec = {
  id: string;
  questions: readonly ClassifierQuestion[];
};

export type ClassifierChoiceAnswer = {
  type: "choice";
  choice: string;
  probabilities: Record<string, number> | null;
  confidence: number | null;
};

export type ClassifierBooleanAnswer = {
  type: "boolean";
  value: boolean;
  probability: number | null;
};

export type ClassifierAnswer = ClassifierChoiceAnswer | ClassifierBooleanAnswer;

export const CLASSIFIER_MODELS = ["jev", "gemini"] as const;

export type ClassifierModel = (typeof CLASSIFIER_MODELS)[number];

export type ClassifierResult = {
  model: ClassifierModel;
  answers: Record<string, ClassifierAnswer>;
  costMicrocents: number | null;
  latencyMs: number;
};

const QUESTION_ID = /^[a-z][a-z0-9_]{0,63}$/;
const MAX_CHOICE_OPTIONS = 255;

export function classifierSpecProblems(spec: ClassifierSpec): string[] {
  const problems: string[] = [];
  const seen = new Set<string>();
  if (spec.questions.length === 0) problems.push("the spec has no questions");
  for (const question of spec.questions) {
    if (!QUESTION_ID.test(question.id)) problems.push(`question id "${question.id}" is not a lowercase identifier`);
    if (seen.has(question.id)) problems.push(`question id "${question.id}" is used twice`);
    seen.add(question.id);
    if (!question.instruction.trim()) problems.push(`question "${question.id}" has no instruction`);
    if (question.type === "choice") {
      const keys = Object.keys(question.options);
      if (keys.length < 2 || keys.length > MAX_CHOICE_OPTIONS)
        problems.push(`choice "${question.id}" needs 2 to ${MAX_CHOICE_OPTIONS} options`);
      if (keys.some((key) => !key.trim())) problems.push(`choice "${question.id}" has an empty option key`);
    }
  }
  return problems;
}

function unitInterval(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1 ? value : null;
}

function probabilityRecord(value: unknown, allowedKeys: readonly string[]): Record<string, number> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const out: Record<string, number> = {};
  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    const probability = unitInterval(raw);
    if (!allowedKeys.includes(key) || probability === null) return null;
    out[key] = probability;
  }
  return out;
}

export function parseClassifierAnswer(question: ClassifierQuestion, raw: unknown): ClassifierAnswer | null {
  if (!raw || typeof raw !== "object") return null;
  const answer = raw as Record<string, unknown>;
  if (answer.type !== question.type) return null;
  if (question.type === "choice") {
    const keys = Object.keys(question.options);
    if (typeof answer.choice !== "string" || !keys.includes(answer.choice)) return null;
    const probabilities = answer.probabilities === undefined ? null : probabilityRecord(answer.probabilities, keys);
    if (answer.probabilities !== undefined && probabilities === null) return null;
    return { type: "choice", choice: answer.choice, probabilities, confidence: unitInterval(answer.confidence) };
  }
  if (typeof answer.value === "boolean")
    return { type: "boolean", value: answer.value, probability: unitInterval(answer.probability) };
  const probability = unitInterval(answer.probability);
  if (probability === null) return null;
  return { type: "boolean", value: probability >= 0.5, probability };
}

export function parseClassifierAnswers(spec: ClassifierSpec, raw: unknown): Record<string, ClassifierAnswer> | null {
  if (!raw || typeof raw !== "object") return null;
  const source = raw as Record<string, unknown>;
  const answers: Record<string, ClassifierAnswer> = {};
  for (const question of spec.questions) {
    const answer = parseClassifierAnswer(question, source[question.id]);
    if (!answer) return null;
    answers[question.id] = answer;
  }
  return answers;
}
