export function errorDigest(error: unknown): string | null {
  if (!error || typeof error !== "object") return null;

  const { digest } = error as { digest?: unknown };
  return typeof digest === "string" && digest.length > 0 ? digest : null;
}
