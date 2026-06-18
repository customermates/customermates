import { NextResponse } from "next/server";
import { z } from "zod";

import { appErrorResponse } from "@/core/errors/app-errors";

export const ErrorResponseSchema = z.string();

export const CommonApiResponses = {
  "400": {
    description: "Bad Request - Validation error",
    content: {
      "application/json": {
        schema: ErrorResponseSchema,
      },
    },
  },
  "401": {
    description: "Not authenticated",
    content: {
      "application/json": {
        schema: ErrorResponseSchema,
      },
    },
  },
  "403": {
    description: "Not authorized",
    content: {
      "application/json": {
        schema: ErrorResponseSchema,
      },
    },
  },
  "500": {
    description: "Unexpected error",
    content: {
      "application/json": {
        schema: ErrorResponseSchema,
      },
    },
  },
} as const;

export function handleError(source: unknown): NextResponse {
  const appError = appErrorResponse(source);
  if (appError) return NextResponse.json(appError.message, { status: appError.statusCode });

  throw source instanceof Error ? source : new Error("Unexpected non-Error thrown", { cause: source });
}
