import type { InteractorFailureKind } from "@/core/validation/validation.utils";

type PrismaClientFailure = { status: number; kind: InteractorFailureKind; message: string };

const BUSY: PrismaClientFailure = {
  status: 429,
  kind: "rate_limit",
  message: "The service is busy. Retry the request shortly.",
};

const TRANSACTION_ENDED: PrismaClientFailure = {
  status: 422,
  kind: "unavailable",
  message: "The transaction ended before the operation could finish. No changes were saved.",
};

const PRISMA_CLIENT_ERRORS: Record<string, PrismaClientFailure> = {
  P2025: { status: 404, kind: "not_found", message: "The requested record was not found" },
  P2003: { status: 400, kind: "validation", message: "A referenced record was not found" },
  P2002: { status: 409, kind: "conflict", message: "That value conflicts with an existing record" },
  P2023: { status: 400, kind: "validation", message: "Invalid identifier" },
  P2009: { status: 400, kind: "validation", message: "Invalid identifier" },
  P2024: BUSY,
  P2028: TRANSACTION_ENDED,
};

const BUSY_DATABASE_CODES = new Set(["55P03"]);

type ErrorChainLink = {
  code?: unknown;
  originalCode?: unknown;
  cause?: unknown;
  meta?: { driverAdapterError?: unknown };
};

function busyDatabaseError(source: unknown, depth = 0): boolean {
  if (!source || typeof source !== "object" || depth > 4) return false;
  const link = source as ErrorChainLink;
  if ([link.code, link.originalCode].some((code) => typeof code === "string" && BUSY_DATABASE_CODES.has(code)))
    return true;
  return busyDatabaseError(link.cause, depth + 1) || busyDatabaseError(link.meta?.driverAdapterError, depth + 1);
}

export function prismaClientError(source: unknown): PrismaClientFailure | null {
  if (busyDatabaseError(source)) return BUSY;
  const code = (source as { code?: unknown } | null | undefined)?.code;
  return typeof code === "string" ? (PRISMA_CLIENT_ERRORS[code] ?? null) : null;
}

export function isBusyDatabaseError(source: unknown): boolean {
  return prismaClientError(source) === BUSY;
}
