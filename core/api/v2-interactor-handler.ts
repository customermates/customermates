import { NextResponse } from "next/server";
import { z } from "zod";

import { AppErrorCode, appErrorDetails } from "@/core/errors/app-errors";
import { prismaClientError } from "@/core/errors/prisma-client-error";
import { CustomErrorCode } from "@/core/validation/validation.types";
import {
  interactorFailureStatus,
  serializeInteractorFailure,
  SerializedInteractorFailureSchema,
  type InteractorFailureKind,
  type SerializedInteractorFailure,
} from "@/core/validation/validation.utils";

export const V2ErrorResponseSchema = z
  .object({ error: SerializedInteractorFailureSchema })
  .strict()
  .describe(
    "Structured failure. error.kind classifies the HTTP status. Each issue carries its JSON path and, when one applies, a stable customCode such as recordVersionChanged or recordSchemaChanged. Messages are localized prose for people.",
  );

function failureResponse(description: string) {
  return { description, content: { "application/json": { schema: V2ErrorResponseSchema } } };
}

export const V2ApiResponses = {
  "400": failureResponse("Bad Request"),
  "401": failureResponse("Not authenticated"),
  "403": failureResponse("Not authorized"),
  "404": failureResponse("Not found"),
  "409": failureResponse("Conflict"),
  "500": failureResponse("Unexpected error"),
} as const;

const APP_ERROR_FAILURES: Record<AppErrorCode, [InteractorFailureKind, CustomErrorCode]> = {
  [AppErrorCode.unauthenticated]: ["authentication", CustomErrorCode.notAuthenticated],
  [AppErrorCode.inactiveUser]: ["authorization", CustomErrorCode.userInactive],
  [AppErrorCode.permissionDenied]: ["authorization", CustomErrorCode.permissionDenied],
  [AppErrorCode.demoMode]: ["authorization", CustomErrorCode.demoMode],
  [AppErrorCode.invalidJsonBody]: ["validation", CustomErrorCode.invalidJsonBody],
};

function failure(error: SerializedInteractorFailure, status: number): NextResponse {
  return NextResponse.json({ error }, { status });
}

export function interactorFailureResponse(error: z.ZodError): NextResponse {
  return failure(serializeInteractorFailure(error), interactorFailureStatus(error));
}

export function handleError(source: unknown): NextResponse {
  const appError = appErrorDetails(source);
  if (appError) {
    const [kind, customCode] = APP_ERROR_FAILURES[appError.code];
    return failure(
      { kind, issues: [{ code: "custom", path: [], message: appError.message, customCode }] },
      appError.statusCode,
    );
  }

  const prismaError = prismaClientError(source);
  if (prismaError) {
    const kind = prismaError.status === 404 ? "not_found" : prismaError.status === 409 ? "conflict" : "validation";
    return failure({ kind, issues: [{ code: "custom", path: [], message: prismaError.message }] }, prismaError.status);
  }

  throw source instanceof Error ? source : new Error("Unexpected non-Error thrown", { cause: source });
}
