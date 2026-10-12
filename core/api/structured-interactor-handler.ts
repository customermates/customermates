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

export const StructuredErrorResponseSchema = z
  .object({ error: SerializedInteractorFailureSchema })
  .strict()
  .describe(
    "Structured failure. error.kind classifies the HTTP status. Each issue carries its JSON path and, when one applies, a stable customCode such as recordVersionChanged or recordSchemaChanged. Messages are localized prose for people.",
  );

function failureResponse(description: string) {
  return { description, content: { "application/json": { schema: StructuredErrorResponseSchema } } };
}

export const CommonApiResponses = {
  "400": failureResponse("Bad Request"),
  "401": failureResponse("Not authenticated"),
  "403": failureResponse("Not authorized"),
  "500": { description: "Unexpected error. The body is not a structured failure." },
} as const;

export const NotFoundApiResponse = { "404": failureResponse("Not found") } as const;

export const ConflictApiResponse = { "409": failureResponse("Conflict") } as const;

const UnavailableApiResponse = {
  "422": failureResponse("Unavailable: the request is valid but cannot be served right now (error.kind unavailable)"),
} as const;

const RateLimitApiResponse = { "429": failureResponse("Rate limited: retry later (error.kind rate_limit)") } as const;

export const MessagingProviderApiResponses = {
  "409": failureResponse("Conflict, such as a provider rejection or a disconnected or restricted channel"),
  ...UnavailableApiResponse,
  ...RateLimitApiResponse,
} as const;

export const StructuredApiResponses = {
  ...CommonApiResponses,
  ...NotFoundApiResponse,
  ...ConflictApiResponse,
  ...UnavailableApiResponse,
  ...RateLimitApiResponse,
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
    return failure(
      { kind: prismaError.kind, issues: [{ code: "custom", path: [], message: prismaError.message }] },
      prismaError.status,
    );
  }

  throw source instanceof Error ? source : new Error("Unexpected non-Error thrown", { cause: source });
}
