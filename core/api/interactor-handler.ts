import { NextResponse } from "next/server";
import { z } from "zod";

import { appErrorResponse } from "@/core/errors/app-errors";
import { prismaClientError } from "@/core/errors/prisma-client-error";

export const ErrorResponseSchema = z.string();

export const CommonApiResponses = {
  "400": {
    description: "Bad Request",
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

  const prismaError = prismaClientError(source);
  if (prismaError) return NextResponse.json(prismaError.message, { status: prismaError.status });

  throw source instanceof Error ? source : new Error("Unexpected non-Error thrown", { cause: source });
}
