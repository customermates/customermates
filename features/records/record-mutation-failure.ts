import type { SerializedInteractorFailure } from "@/core/validation/validation.utils";

export type RecordFieldErrors = { errors: string[]; fields: Record<string, string[]>; assignees?: string[] };

export function recordFieldErrors(
  failure: SerializedInteractorFailure,
  fieldIds: readonly string[],
): RecordFieldErrors {
  const result: RecordFieldErrors = { errors: [], fields: {} };
  for (const issue of failure.issues) {
    const [scope, key, index] = issue.path;
    const fieldId = scope === "mutation" && key === "fields" && typeof index === "number" ? fieldIds[index] : undefined;
    if (fieldId) (result.fields[fieldId] ??= []).push(issue.message);
    else if (scope === "mutation" && key === "assignedUserIds") (result.assignees ??= []).push(issue.message);
    else result.errors.push(issue.message);
  }
  return result;
}

export function recordValuesErrorTree({ errors, fields, assignees }: RecordFieldErrors) {
  return {
    errors,
    properties: {
      values: {
        errors: [],
        properties: Object.fromEntries(
          Object.entries(fields).map(([fieldId, messages]) => [fieldId, { errors: messages }]),
        ),
      },
      ...(assignees ? { assignedUserIds: { errors: assignees } } : {}),
    },
  };
}
