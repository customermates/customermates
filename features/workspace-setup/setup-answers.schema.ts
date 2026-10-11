import { z } from "zod";

import { SETUP_PART_IDS, setupPart } from "./setup-interview";

const ChoiceIdSchema = z.string().regex(/^[A-Za-z][A-Za-z0-9_-]{0,39}$/);
const CustomTextSchema = z.string().trim().min(1).max(80);

export const SetupAnswerValueSchema = z.discriminatedUnion("format", [
  z.object({ format: z.literal("singleChoice"), value: ChoiceIdSchema }).strict(),
  z
    .object({
      format: z.literal("multipleChoice"),
      values: z.array(ChoiceIdSchema).max(20),
      custom: z.array(CustomTextSchema).max(10),
    })
    .strict(),
  z
    .object({
      format: z.literal("orderedList"),
      items: z
        .array(
          z
            .object({
              label: CustomTextSchema,
              winChance: z.number().int().min(0).max(100).optional(),
            })
            .strict(),
        )
        .max(20),
    })
    .strict(),
  z.object({ format: z.literal("rankedPick"), values: z.array(ChoiceIdSchema).min(1).max(3) }).strict(),
  z
    .object({
      format: z.literal("range"),
      min: z.number().finite().nonnegative(),
      max: z.number().finite().nonnegative().nullable(),
    })
    .strict(),
  z.object({ format: z.literal("shortText"), value: z.string().trim().max(1_000) }).strict(),
]);
export type SetupAnswerValue = z.infer<typeof SetupAnswerValueSchema>;

export const SetupAnswerSchema = z
  .object({
    source: z.enum(["user", "website"]),
    confidence: z.number().min(0).max(1),
    value: SetupAnswerValueSchema,
  })
  .strict();
export type SetupAnswer = z.infer<typeof SetupAnswerSchema>;

export const SetupAnswersSchema = z
  .partialRecord(z.enum(SETUP_PART_IDS), SetupAnswerSchema)
  .superRefine((answers, context) => {
    for (const [id, answer] of Object.entries(answers)) {
      const part = setupPart(id);
      if (!part || !answer) continue;
      const issue = (message: string) => context.addIssue({ code: "custom", path: [id], message });
      const value = answer.value;
      if (value.format !== part.format) {
        issue("The answer does not match the question format.");
        continue;
      }
      if (answer.source === "website" && part.prefill === "no") issue("This question is never pre-filled.");
      if (value.format === "singleChoice" && part.format === "singleChoice" && !part.optionSource)
        if (!part.options.some((option) => option.id === value.value)) issue("Unknown option.");

      if (value.format === "multipleChoice" && part.format === "multipleChoice") {
        if (new Set(value.values).size !== value.values.length) issue("Each option can be chosen once.");
        if (part.options.length && value.values.some((id) => !part.options.some((option) => option.id === id)))
          issue("Unknown option.");
        if (!part.options.length && value.values.length) issue("This question only takes your own entries.");
        if (!part.allowCustom && value.custom.length) issue("This question takes no own entries.");
      }
      if (value.format === "orderedList" && part.format === "orderedList") {
        if (value.items.length > part.maxItems) issue("Too many entries.");
        if (!part.winChance && value.items.some((item) => item.winChance !== undefined))
          issue("This list has no win chance.");
      }
      if (value.format === "rankedPick" && part.format === "rankedPick") {
        if (value.values.length > part.maxPicks) issue("Too many picks.");
        if (new Set(value.values).size !== value.values.length) issue("Each option can be picked once.");
        if (value.values.some((id) => !part.options.some((option) => option.id === id))) issue("Unknown option.");
      }
      if (value.format === "range" && part.format === "range") {
        if (part.single && value.max !== null) issue("This question takes one number.");
        if (value.min < part.min || value.min > part.max || (value.max !== null && value.max > part.max))
          issue("The number is out of range.");
        if (value.max !== null && value.max < value.min) issue("The range is reversed.");
      }
      if (value.format === "shortText" && part.format === "shortText" && value.value.length > part.maxLength)
        issue("The text is too long.");
    }
  });
export type SetupAnswers = z.infer<typeof SetupAnswersSchema>;
