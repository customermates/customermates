import type { $ZodRawIssue } from "zod/v4/core";

import { z } from "zod";

import { CustomErrorCode } from "./validation.types";

export type Data<T> = T extends z.ZodSchema<infer U> ? U : never;

export type Validated<T> = Promise<{ ok: true; data: T } | { ok: false; error: z.ZodError }>;

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

function secureUrlSchema() {
  return z.preprocess(
    (val) => {
      if (typeof val !== "string") return val;
      const trimmed = val.trim();
      if (!trimmed || trimmed.includes("://") || /^(mailto|tel):/i.test(trimmed)) return trimmed;
      return `https://${trimmed}`;
    },
    z.url({ protocol: /^(https?|mailto|tel)$/ }),
  );
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
