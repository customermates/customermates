import { NextResponse } from "next/server";
import { z } from "zod";

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
  const error = source instanceof Error ? source : new Error("Unexpected non-Error thrown", { cause: source });

  const errorMessage = error.message;

  if (errorMessage === "User not found") return NextResponse.json("Not authenticated", { status: 401 });

  if (
    errorMessage.includes("Access denied") ||
    errorMessage.includes("insufficient permissions") ||
    errorMessage.includes("API key")
  )
    return NextResponse.json("Not authorized", { status: 403 });

  if (errorMessage.includes("demo mode") && errorMessage.includes("not available")) {
    return NextResponse.json("This action is not available in demo mode. Please sign in to access all features.", {
      status: 403,
    });
  }

  throw error;
}
