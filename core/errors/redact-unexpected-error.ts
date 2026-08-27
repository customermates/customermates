export function redactUnexpectedError(_error: unknown, message: string): Error {
  const redacted = new Error(message);
  Error.captureStackTrace?.(redacted, redactUnexpectedError);
  return redacted;
}
