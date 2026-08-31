export type OperatorActionErrorCode =
  | "accessDenied"
  | "conflict"
  | "invalidInput"
  | "notFound"
  | "unavailable"
  | "unexpected";

export type OperatorActionState<T> =
  | { status: "idle"; data?: never; errorCode?: never; operationId?: string }
  | { status: "success"; data: T; errorCode?: never; operationId?: string }
  | { status: "error"; data?: never; errorCode: OperatorActionErrorCode; operationId?: string };

export function operatorErrorKey(code: OperatorActionErrorCode): string {
  if (code === "accessDenied") return "OperatorConsole.errors.accessDenied";
  if (code === "conflict") return "OperatorConsole.errors.conflict";
  if (code === "invalidInput") return "OperatorConsole.errors.invalidInput";
  if (code === "notFound") return "OperatorConsole.errors.notFound";
  if (code === "unavailable") return "OperatorConsole.errors.unavailable";

  return "OperatorConsole.errors.unexpected";
}
