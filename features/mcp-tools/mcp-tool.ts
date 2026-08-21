import { z } from "zod";
import { getTranslations } from "next-intl/server";

import { AppErrorCode, appErrorDetailsInCauseChain } from "@/core/errors/app-errors";
import { prismaClientError } from "@/core/errors/prisma-client-error";
import {
  createZodError,
  interactorFailureKind,
  serializeInteractorFailure,
  type InteractorFailureKind,
  type SerializedInteractorFailure,
} from "@/core/validation/validation.utils";
import { CustomErrorCode } from "@/core/validation/validation.types";

export const VALIDATION_ERROR_PREFIX = "Validation error:";

export function validationError(error: z.ZodError): string {
  return `${VALIDATION_ERROR_PREFIX} ${z.prettifyError(error)}`;
}

export type McpToolFailureResult = {
  text: string;
  failure: SerializedInteractorFailure;
};

export type McpToolResult =
  | string
  | McpToolFailureResult
  | { text: string; structuredContent: Record<string, unknown> };

export function mcpToolResultText(result: McpToolResult): string {
  return typeof result === "string" ? result : result.text;
}

export type McpTool = {
  name: string;
  title: string;
  description: string;
  annotations?: Record<string, boolean>;
  inputSchema: z.ZodType;
  outputSchema?: z.ZodType;
  execute: (...args: never[]) => Promise<McpToolResult> | McpToolResult;
};

export type McpToolExecutionResult =
  | {
      ok: true;
      result: string;
      structuredContent?: Record<string, unknown>;
    }
  | {
      ok: false;
      result: string;
      failure: SerializedInteractorFailure;
    };

export function mcpInteractorFailure(
  error: z.ZodError,
  kind: InteractorFailureKind = interactorFailureKind(error),
  text = validationError(error),
): McpToolFailureResult {
  return {
    text,
    failure: serializeInteractorFailure(error, kind),
  };
}

export function mcpValidationFailure(error: z.ZodError): McpToolFailureResult {
  return mcpInteractorFailure(error, "validation");
}

function legacyValidationFailure(text: string): McpToolExecutionResult {
  return {
    ok: false,
    result: text,
    failure: {
      kind: "validation",
      issues: [
        {
          code: "custom",
          path: [],
          message: text.slice(VALIDATION_ERROR_PREFIX.length).trim() || "The input is invalid.",
        },
      ],
    },
  };
}

const APP_ERROR_CUSTOM_CODES: Record<AppErrorCode, CustomErrorCode> = {
  [AppErrorCode.unauthenticated]: CustomErrorCode.notAuthenticated,
  [AppErrorCode.inactiveUser]: CustomErrorCode.userInactive,
  [AppErrorCode.permissionDenied]: CustomErrorCode.permissionDenied,
  [AppErrorCode.demoMode]: CustomErrorCode.demoMode,
};

const APP_ERROR_KINDS: Record<AppErrorCode, InteractorFailureKind> = {
  [AppErrorCode.unauthenticated]: "authentication",
  [AppErrorCode.inactiveUser]: "authorization",
  [AppErrorCode.permissionDenied]: "authorization",
  [AppErrorCode.demoMode]: "authorization",
};

export async function expectedMcpToolFailure(error: unknown): Promise<McpToolExecutionResult | null> {
  const appError = appErrorDetailsInCauseChain(error);
  if (appError) {
    const customCode = APP_ERROR_CUSTOM_CODES[appError.code];
    const t = await getTranslations("Common.errors");
    const message = t.raw(customCode) as string;
    const failure = mcpInteractorFailure(
      createZodError(message, [], { error: customCode }),
      APP_ERROR_KINDS[appError.code],
      message,
    );
    return { ok: false, result: failure.text, failure: failure.failure };
  }

  const prismaError = prismaClientError(error);
  if (!prismaError) return null;
  const kind: InteractorFailureKind =
    prismaError.status === 404 ? "not_found" : prismaError.status === 409 ? "conflict" : "validation";
  const failure = mcpInteractorFailure(createZodError(prismaError.message), kind, prismaError.message);
  return { ok: false, result: failure.text, failure: failure.failure };
}

export async function executeMcpTool(tool: McpTool, args: unknown[]): Promise<McpToolExecutionResult> {
  try {
    const raw = await (tool.execute as (...values: unknown[]) => Promise<McpToolResult> | McpToolResult)(...args);
    if (typeof raw === "string")
      return raw.startsWith(VALIDATION_ERROR_PREFIX) ? legacyValidationFailure(raw) : { ok: true, result: raw };

    if ("failure" in raw) return { ok: false, result: raw.text, failure: raw.failure };
    return {
      ok: true,
      result: raw.text,
      structuredContent: raw.structuredContent,
    };
  } catch (error) {
    const expected = await expectedMcpToolFailure(error);
    if (expected) return expected;
    throw error;
  }
}
