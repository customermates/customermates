import type { AnswerAssignment, AnswerField, AnswerValue } from "@/features/records/record-value-coercion";
import type { RecordIdentityInput } from "@/features/records/record-identity.schema";
import type { SubmissionAnswer } from "./public-form.repo";
import type { PublicFormConfig, PublicFormFieldError } from "./public-form.schema";

import { z } from "zod";

import { normalizeChannelValue } from "@/features/records/channel-value";
import { coerceAnswers, hasTextValue } from "@/features/records/record-value-coercion";

export type FormAnswerInput = {
  answers: Record<string, AnswerValue>;
  email?: string;
  name?: string;
};

export type AcceptedFormAnswers = {
  ok: true;
  fields: AnswerAssignment[];
  identities: RecordIdentityInput[];
  display: Record<string, string>;
  email: string | null;
  name: string | null;
};

export type BuiltFormAnswers = AcceptedFormAnswers | { ok: false; errors: Record<string, PublicFormFieldError> };

const SubmissionAnswersSchema = z.array(
  z.object({ fieldId: z.string().nullable(), label: z.string(), value: z.string() }),
);

export function storedSubmissionAnswers(value: unknown): SubmissionAnswer[] {
  const parsed = SubmissionAnswersSchema.safeParse(value);
  return parsed.success ? parsed.data : [];
}

export function submissionAnswers(config: PublicFormConfig, built: AcceptedFormAnswers): SubmissionAnswer[] {
  const { person } = config;
  return [
    ...(person && built.email ? [{ fieldId: null, label: person.emailLabel, value: built.email }] : []),
    ...(person?.nameLabel && built.name ? [{ fieldId: null, label: person.nameLabel, value: built.name }] : []),
    ...config.fields.flatMap((field) => {
      const value = built.display[field.fieldId];
      return value ? [{ fieldId: field.fieldId, label: field.label, value }] : [];
    }),
  ];
}

export function mutationFieldErrors(
  fields: readonly AnswerAssignment[],
  issues: ReadonlyArray<{ path: ReadonlyArray<PropertyKey> }>,
): Record<string, PublicFormFieldError> {
  const errors: Record<string, PublicFormFieldError> = {};
  for (const issue of issues) {
    const at = issue.path.indexOf("fields");
    const index = at >= 0 ? issue.path[at + 1] : undefined;
    const field = typeof index === "number" ? fields[index] : undefined;
    if (field) errors[field.fieldId] = "invalid";
  }
  return errors;
}

export function buildFormAnswers(
  config: PublicFormConfig,
  typeId: string,
  modelFields: readonly AnswerField[],
  input: FormAnswerInput,
): BuiltFormAnswers {
  const { errors, fields, identities, display } = coerceAnswers(config.fields, typeId, modelFields, input.answers);

  let email: string | null = null;
  let name: string | null = null;
  if (config.person) {
    const rawEmail = (input.email ?? "").trim();
    if (!rawEmail) errors.email = "required";
    else {
      email = normalizeChannelValue("mail", rawEmail);
      if (!email) errors.email = "email";
    }
    const rawName = (input.name ?? "").trim();
    if (config.person.nameLabel && hasTextValue(rawName)) {
      if (rawName.length > 200) errors.name = "invalid";
      else name = rawName;
    }
  }

  return Object.keys(errors).length > 0
    ? { ok: false, errors }
    : { ok: true, fields, identities, display, email, name };
}
