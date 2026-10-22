import type { SerializedInteractorFailure } from "@/core/validation/validation.utils";

type RecordFieldErrors = {
  errors: string[];
  fields: Record<string, string[]>;
  parts?: Record<string, Record<string, string[]>>;
  assignees?: string[];
};

export function recordFieldErrors(
  failure: SerializedInteractorFailure,
  fieldIds: readonly string[],
): RecordFieldErrors {
  const result: RecordFieldErrors = { errors: [], fields: {} };
  for (const issue of failure.issues) {
    const [scope, key, index, value, part] = issue.path;
    const fieldId = scope === "mutation" && key === "fields" && typeof index === "number" ? fieldIds[index] : undefined;
    if (fieldId) {
      (result.fields[fieldId] ??= []).push(issue.message);
      if (value === "value" && typeof part === "string")
        ((result.parts ??= {})[fieldId] ??= {})[part] = [...(result.parts?.[fieldId]?.[part] ?? []), issue.message];
    } else if (scope === "mutation" && key === "assignedUserIds") (result.assignees ??= []).push(issue.message);
    else result.errors.push(issue.message);
  }
  return result;
}

export function recordValuesErrorTree({ errors, fields, parts, assignees }: RecordFieldErrors) {
  return {
    errors,
    properties: {
      values: {
        errors: [],
        properties: Object.fromEntries(
          Object.entries(fields).map(([fieldId, messages]) => [
            fieldId,
            {
              errors: messages,
              ...(parts?.[fieldId]
                ? {
                    properties: Object.fromEntries(
                      Object.entries(parts[fieldId]).map(([part, partMessages]) => [part, { errors: partMessages }]),
                    ),
                  }
                : {}),
            },
          ]),
        ),
      },
      ...(assignees ? { assignedUserIds: { errors: assignees } } : {}),
    },
  };
}
