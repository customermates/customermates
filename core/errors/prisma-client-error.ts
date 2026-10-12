import type { InteractorFailureKind } from "@/core/validation/validation.utils";

type PrismaClientFailure = { status: number; kind: InteractorFailureKind; message: string };

const BUSY: PrismaClientFailure = {
  status: 429,
  kind: "rate_limit",
  message: "The service is busy. Retry the request shortly.",
};

const PRISMA_CLIENT_ERRORS: Record<string, PrismaClientFailure> = {
  P2025: { status: 404, kind: "not_found", message: "The requested record was not found" },
  P2003: { status: 400, kind: "validation", message: "A referenced record was not found" },
  P2002: { status: 409, kind: "conflict", message: "That value conflicts with an existing record" },
  P2023: { status: 400, kind: "validation", message: "Invalid identifier" },
  P2009: { status: 400, kind: "validation", message: "Invalid identifier" },
  P2024: BUSY,
  P2028: BUSY,
};

export function prismaClientError(source: unknown): PrismaClientFailure | null {
  const code = (source as { code?: unknown } | null | undefined)?.code;
  return typeof code === "string" ? (PRISMA_CLIENT_ERRORS[code] ?? null) : null;
}
