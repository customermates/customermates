import type { $ZodIssue, $ZodRawIssue } from "zod/v4/core";

import { z } from "zod";

import { CustomErrorCode } from "./validation.types";

export type Data<T> = T extends z.ZodSchema<infer U> ? U : never;

export type InteractorFailure = { ok: false; error: z.ZodError };

export type InteractorOutcome<T> = { ok: true; data: T } | InteractorFailure;

export type InteractorResult<T> = Promise<InteractorOutcome<T>>;

export type Validated<T> = InteractorResult<T>;

export function isInteractorFailure(value: unknown): value is InteractorFailure {
  return Boolean(
    value &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      (value as { ok?: unknown }).ok === false &&
      (value as { error?: unknown }).error instanceof z.ZodError,
  );
}

export const InteractorFailureKindSchema = z.enum([
  "validation",
  "authentication",
  "authorization",
  "not_found",
  "conflict",
  "rate_limit",
  "unavailable",
]);

export type InteractorFailureKind = z.infer<typeof InteractorFailureKindSchema>;

export const SerializedInteractorIssueSchema = z.object({
  code: z.string(),
  path: z.array(z.union([z.string(), z.number()])),
  message: z.string(),
  customCode: z.enum(CustomErrorCode).optional(),
});

export const SerializedInteractorFailureSchema = z.object({
  kind: InteractorFailureKindSchema,
  issues: z.array(SerializedInteractorIssueSchema).min(1),
});

export type SerializedInteractorFailure = z.infer<typeof SerializedInteractorFailureSchema>;

const AUTHENTICATION_FAILURE_CODES = new Set<CustomErrorCode>([CustomErrorCode.notAuthenticated]);
const AUTHORIZATION_FAILURE_CODES = new Set<CustomErrorCode>([
  CustomErrorCode.userInactive,
  CustomErrorCode.permissionDenied,
  CustomErrorCode.demoMode,
  CustomErrorCode.roleSelfEditForbidden,
]);
const NOT_FOUND_FAILURE_CODES = new Set<CustomErrorCode>([
  CustomErrorCode.calendarEventNotFound,
  CustomErrorCode.connectedAccountNotFound,
  CustomErrorCode.contactNotFound,
  CustomErrorCode.customColumnNotFound,
  CustomErrorCode.customColumnIdNotFound,
  CustomErrorCode.dealNotFound,
  CustomErrorCode.organizationNotFound,
  CustomErrorCode.roleNotFound,
  CustomErrorCode.serviceNotFound,
  CustomErrorCode.taskNotFound,
  CustomErrorCode.threadNotFound,
  CustomErrorCode.userNotFound,
  CustomErrorCode.webhookDeliveryNotFound,
  CustomErrorCode.webhookNotFound,
  CustomErrorCode.widgetNotFound,
]);
const CONFLICT_FAILURE_CODES = new Set<CustomErrorCode>([
  CustomErrorCode.operatorConflict,
  CustomErrorCode.roleSystemImmutable,
]);

function issueCustomCode(issue: $ZodIssue): CustomErrorCode | null {
  const candidate = issue.code === "custom" ? issue.params?.error : undefined;
  return typeof candidate === "string" && Object.values(CustomErrorCode).includes(candidate as CustomErrorCode)
    ? (candidate as CustomErrorCode)
    : null;
}

function issueStampedKind(issue: $ZodIssue): InteractorFailureKind | null {
  const candidate = issue.code === "custom" ? issue.params?.kind : undefined;
  const parsed = InteractorFailureKindSchema.safeParse(candidate);
  return parsed.success ? parsed.data : null;
}

export function interactorFailureKind(error: z.ZodError): InteractorFailureKind {
  for (const issue of error.issues) {
    const stamped = issueStampedKind(issue);
    if (stamped) return stamped;
  }

  const codes = error.issues.map(issueCustomCode).filter((code): code is CustomErrorCode => Boolean(code));
  if (codes.some((code) => AUTHENTICATION_FAILURE_CODES.has(code))) return "authentication";
  if (codes.some((code) => AUTHORIZATION_FAILURE_CODES.has(code))) return "authorization";
  if (codes.some((code) => NOT_FOUND_FAILURE_CODES.has(code))) return "not_found";
  if (codes.some((code) => CONFLICT_FAILURE_CODES.has(code))) return "conflict";
  return "validation";
}

export function interactorFailureStatus(error: z.ZodError): number {
  const kind = interactorFailureKind(error);
  if (kind === "authentication") return 401;
  if (kind === "authorization") return 403;
  if (kind === "not_found") return 404;
  if (kind === "conflict") return 409;
  if (kind === "rate_limit") return 429;
  if (kind === "unavailable") return 422;
  return 400;
}

function serializableIssuePath(path: PropertyKey[]): Array<string | number> {
  return path.map((part) => (typeof part === "symbol" ? (part.description ?? "symbol") : part));
}

export function serializeInteractorFailure(
  error: z.ZodError,
  kind: InteractorFailureKind = interactorFailureKind(error),
): SerializedInteractorFailure {
  return {
    kind,
    issues: error.issues.map((issue) => {
      const customCode = issueCustomCode(issue) ?? undefined;

      return {
        code: issue.code,
        path: serializableIssuePath(issue.path),
        message: issue.message,
        ...(customCode ? { customCode } : {}),
      };
    }),
  };
}

export async function unwrapValidated<T>(result: Validated<T>): Promise<T> {
  const resolved = await result;
  if (!resolved.ok) throw resolved.error;
  return resolved.data;
}

export function createZodError<T = unknown>(
  message: string,
  path: (string | number)[] = [],
  params?: Record<string, unknown>,
): z.ZodError<T> {
  return new z.ZodError([{ code: "custom", path, message, params }]) as z.ZodError<T>;
}

export function createErrorHandler(errors: Record<string, string>): (issue: $ZodRawIssue) => string | undefined {
  return (issue: $ZodRawIssue) => {
    if (issue.code !== "custom") return undefined;

    const error = issue.params?.error as CustomErrorCode;

    if (!error || typeof error !== "string")
      throw new Error(`Custom validation error must define 'error' param with a CustomErrorCode`);

    if (!Object.values(CustomErrorCode).includes(error))
      throw new Error(`Unknown validation error code: ${error}. Add it to CustomErrorCode enum in validation.types.ts`);

    if (!errors[error]) throw new Error("Custom error translations are missing from the request parse context.");

    let message = errors[error];

    if (issue.params) {
      for (const [key, value] of Object.entries(issue.params)) {
        if (key === "error") continue;

        let param: string;
        if (Array.isArray(value)) param = value.length > 0 ? value.join(", ") : "";
        else if (value != null) param = String(value);
        else param = "";

        message = message.replaceAll(`{${key}}`, param);
      }
    }

    return message;
  };
}

function inferHttpsForBareHost(val: unknown) {
  if (typeof val !== "string") return val;
  const trimmed = val.trim();
  if (!trimmed || /^[/\\]/.test(trimmed) || trimmed.includes("://") || /^(mailto|tel):/i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

function secureUrlSchema() {
  return z.preprocess(inferHttpsForBareHost, z.url({ protocol: /^(https?|mailto|tel)$/ }));
}

function nonBlankText(max: number) {
  return z
    .string()
    .max(max)
    .superRefine((value, ctx) => {
      if (value.trim().length === 0)
        ctx.addIssue({ code: "custom", params: { error: CustomErrorCode.mustNotBeBlank } });
      if (/\u0000/.test(value))
        ctx.addIssue({ code: "custom", params: { error: CustomErrorCode.mustNotContainNullChars } });
    });
}

function passwordSchema() {
  return z.string().superRefine((password, ctx) => {
    const hasMinLength = password.length >= 8;
    const hasUppercase = /[A-Z]/.test(password);
    const hasLowercase = /[a-z]/.test(password);
    const hasNumber = /\d/.test(password);
    const hasSpecialChar = /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password);

    if (!hasMinLength || !hasUppercase || !hasLowercase || !hasNumber || !hasSpecialChar) {
      ctx.addIssue({
        code: "custom",
        params: { error: CustomErrorCode.passwordInvalid },
      });
    }
  });
}

export const zx = {
  nonBlankText,
  secureUrl: secureUrlSchema,
  password: passwordSchema,
};
