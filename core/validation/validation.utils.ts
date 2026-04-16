import type { $ZodRawIssue } from "zod/v4/core";

import { z } from "zod";

import { CustomErrorCode } from "./validation.types";

export type Data<T> = T extends z.ZodSchema<infer U> ? U : never;

export type Validated<T> = Promise<{ ok: true; data: T } | { ok: false; error: z.ZodError }>;

export function createZodError<T = unknown>(message: string, path: (string | number)[] = []): z.ZodError<T> {
  return new z.ZodError([
    {
      code: "custom",
      path,
      message,
    },
  ]) as z.ZodError<T>;
}

export function createErrorHandler(errors: Record<string, string>): (issue: $ZodRawIssue) => string | undefined {
  return (issue: $ZodRawIssue) => {
    if (issue.code !== "custom") return undefined;

    const error = issue.params?.error as CustomErrorCode;

    if (!error || typeof error !== "string")
      throw new Error(`Custom validation error must define 'error' param with a CustomErrorCode`);

    if (!Object.values(CustomErrorCode).includes(error))
      throw new Error(`Unknown validation error code: ${error}. Add it to CustomErrorCode enum in validation.types.ts`);

    if (!errors[error])
      throw new Error("Custom error translations not initialized. configureZodLocale() must be called first.");

    let message = errors[error];

    if (issue.params) {
      for (const [key, value] of Object.entries(issue.params)) {
        if (key === "error") continue;

        let param: string;
        if (Array.isArray(value)) param = value.length > 0 ? value.join(", ") : "";
        else if (value != null) param = String(value);
        else param = "";

        message = message.replace(`{${key}}`, param);
      }
    }

    return message;
  };
}

export function secureUrlSchema() {
  const allowedProtocols = ["https:", "http:", "mailto:", "tel:"];

  return z.url().superRefine((url, ctx) => {
    try {
      const parsed = new URL(url);
      if (!allowedProtocols.includes(parsed.protocol)) {
        ctx.addIssue({
          code: "custom",
          params: { error: CustomErrorCode.urlInvalidProtocol },
        });
      }
    } catch {
      ctx.addIssue({
        code: "custom",
        params: { error: CustomErrorCode.urlInvalidProtocol },
      });
    }
  });
}

export function passwordSchema() {
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
