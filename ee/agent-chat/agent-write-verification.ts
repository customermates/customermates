type ReadResult = {
  ok: boolean;
  data?: {
    fields?: Array<{
      fieldId: string;
      result: { state: string; value?: { kind: string; value?: unknown } };
    }>;
  };
};

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

export async function verifyAgentRecordUpdate(
  input: unknown,
  content: unknown,
  read: (ref: { typeId: string; recordId: string }) => Promise<ReadResult>,
): Promise<string | null> {
  const mutation = object(object(input).mutation);
  if (mutation.action !== "update") return null;
  const result = object(object(content).result);
  if (result.status !== "completed") return null;
  const ref = object(mutation.ref);
  if (typeof ref.typeId !== "string" || typeof ref.recordId !== "string") return null;
  const refs = Array.isArray(result.refs) ? result.refs : [];
  if (!refs.some((candidate) => object(candidate).typeId === ref.typeId && object(candidate).recordId === ref.recordId))
    return "The requested record is absent from the completed update result. Verify its current state before reporting success.";
  const fields = Array.isArray(mutation.fields) ? mutation.fields : [];
  const selected = fields.filter((entry) => object(object(entry).value).kind === "select");
  if (selected.length === 0) return null;
  const current = await read({ typeId: ref.typeId, recordId: ref.recordId });
  if (!current.ok || !current.data?.fields)
    return "The updated record could not be read back. Verify its current state before reporting success.";
  for (const entry of selected) {
    const expected = object(object(entry).value).value;
    const found = current.data.fields.find((field) => field.fieldId === object(entry).fieldId)?.result;
    if (found?.state !== "value" || found.value?.kind !== "select" || found.value.value !== expected)
      return "A requested choice field did not match the saved record after the update. Verify the current stage before reporting success.";
  }
  return null;
}
