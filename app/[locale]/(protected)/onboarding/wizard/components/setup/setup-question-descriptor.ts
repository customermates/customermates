import type { SetupFollowUpQuestion } from "@/ee/workspace-setup/workspace-setup.schema";
import type { SetupOptionSource, SetupQuestionPart } from "@/features/workspace-setup/setup-interview";

export type SetupChoice = { id: string; label: string };

type DescriptorBase = { id: string; label: string; optional: boolean };

export type SetupQuestionDescriptor = DescriptorBase &
  (
    | { format: "singleChoice"; options: SetupChoice[]; optionSource: SetupOptionSource | null }
    | { format: "multipleChoice"; options: SetupChoice[]; allowCustom: boolean }
    | { format: "orderedList"; winChance: boolean; maxItems: number }
    | { format: "rankedPick"; options: SetupChoice[]; maxPicks: number }
    | { format: "range"; unit: "currency" | "days"; single: boolean; min: number; max: number }
    | { format: "shortText"; maxLength: number }
  );

export function partDescriptor(part: SetupQuestionPart, t: (key: string) => string): SetupQuestionDescriptor {
  const base = { id: part.id, label: t(part.labelKey), optional: Boolean(part.optional) };
  const choices = (options: Array<{ id: string; labelKey: string }>) =>
    options.map((option) => ({ id: option.id, label: t(option.labelKey) }));
  switch (part.format) {
    case "singleChoice":
      return {
        ...base,
        format: "singleChoice",
        options: choices(part.options),
        optionSource: part.optionSource ?? null,
      };
    case "multipleChoice":
      return { ...base, format: "multipleChoice", options: choices(part.options), allowCustom: part.allowCustom };
    case "orderedList":
      return { ...base, format: "orderedList", winChance: part.winChance, maxItems: part.maxItems };
    case "rankedPick":
      return { ...base, format: "rankedPick", options: choices(part.options), maxPicks: part.maxPicks };
    case "range":
      return { ...base, format: "range", unit: part.unit, single: part.single, min: part.min, max: part.max };
    case "shortText":
      return { ...base, format: "shortText", maxLength: part.maxLength };
  }
}

export function followUpDescriptor(question: SetupFollowUpQuestion): SetupQuestionDescriptor {
  const base = { id: question.id, label: question.label, optional: false };
  switch (question.format) {
    case "singleChoice":
      return { ...base, format: "singleChoice", options: question.options, optionSource: null };
    case "multipleChoice":
      return { ...base, format: "multipleChoice", options: question.options, allowCustom: question.allowCustom };
    case "orderedList":
      return { ...base, format: "orderedList", winChance: question.winChance, maxItems: question.maxItems };
    case "rankedPick":
      return { ...base, format: "rankedPick", options: question.options, maxPicks: question.maxPicks };
    case "range":
      return {
        ...base,
        format: "range",
        unit: question.unit,
        single: question.single,
        min: question.min,
        max: question.max,
      };
    case "shortText":
      return { ...base, format: "shortText", maxLength: question.maxLength };
  }
}
