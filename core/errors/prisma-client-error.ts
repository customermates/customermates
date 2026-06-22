const PRISMA_CLIENT_ERRORS: Record<string, { status: number; message: string }> = {
  P2025: { status: 404, message: "The requested record was not found" },
  P2003: { status: 400, message: "A referenced record was not found" },
  P2002: { status: 409, message: "That value conflicts with an existing record" },
  P2023: { status: 400, message: "Invalid identifier" },
  P2009: { status: 400, message: "Invalid identifier" },
};

export function prismaClientError(source: unknown): { status: number; message: string } | null {
  const code = (source as { code?: unknown } | null | undefined)?.code;
  return typeof code === "string" ? (PRISMA_CLIENT_ERRORS[code] ?? null) : null;
}
