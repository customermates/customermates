import { z } from "zod";

export const WORKSPACE_SLUG_MAX_LENGTH = 40;

export const WORKSPACE_SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export const RESERVED_WORKSPACE_SLUGS: ReadonlySet<string> = new Set([
  "admin",
  "api",
  "app",
  "create",
  "dashboard",
  "default",
  "demo",
  "new",
  "settings",
  "w",
  "www",
]);

export const FALLBACK_WORKSPACE_SLUG = "workspace";

const SLUG_ATTEMPTS_BEFORE_RANDOM_SUFFIX = 20;

const MAX_SLUG_ATTEMPTS = 30;

const TRANSLITERATIONS: Record<string, string> = {
  ä: "ae",
  ö: "oe",
  ü: "ue",
  ß: "ss",
  æ: "ae",
  œ: "oe",
  ø: "o",
  ł: "l",
  đ: "d",
  ð: "d",
  ı: "i",
  þ: "th",
  "&": " and ",
};

function capSlug(value: string, maxLength = WORKSPACE_SLUG_MAX_LENGTH): string {
  return value.slice(0, maxLength).replace(/^-+|-+$/g, "");
}

export function slugifyWorkspaceName(name: string | null | undefined): string {
  const transliterated = Array.from((name ?? "").toLowerCase(), (char) => TRANSLITERATIONS[char] ?? char).join("");
  const ascii = transliterated.normalize("NFKD").replace(/\p{M}+/gu, "");
  const base = capSlug(ascii.replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, ""));

  if (!base) return FALLBACK_WORKSPACE_SLUG;
  if (RESERVED_WORKSPACE_SLUGS.has(base)) return `${base}-${FALLBACK_WORKSPACE_SLUG}`;
  return base;
}

export function isValidWorkspaceSlug(value: string): boolean {
  return (
    value.length > 0 &&
    value.length <= WORKSPACE_SLUG_MAX_LENGTH &&
    WORKSPACE_SLUG_PATTERN.test(value) &&
    !RESERVED_WORKSPACE_SLUGS.has(value)
  );
}

export const WorkspaceSlugSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(1)
  .max(WORKSPACE_SLUG_MAX_LENGTH)
  .regex(WORKSPACE_SLUG_PATTERN)
  .refine((value) => !RESERVED_WORKSPACE_SLUGS.has(value));

function randomSuffix(): string {
  return crypto.randomUUID().replace(/-/g, "").slice(0, 6);
}

export function workspaceSlugCandidate(base: string, attempt: number): string {
  if (attempt === 0 && base !== FALLBACK_WORKSPACE_SLUG) return base;

  const numbered = base !== FALLBACK_WORKSPACE_SLUG && attempt < SLUG_ATTEMPTS_BEFORE_RANDOM_SUFFIX;
  const suffix = numbered ? String(attempt + 1) : randomSuffix();
  return `${capSlug(base, WORKSPACE_SLUG_MAX_LENGTH - suffix.length - 1)}-${suffix}`;
}

export async function claimWorkspaceSlug(
  name: string | null | undefined,
  tryClaim: (slug: string) => Promise<boolean>,
): Promise<string> {
  const base = slugifyWorkspaceName(name);

  for (let attempt = 0; attempt < MAX_SLUG_ATTEMPTS; attempt++) {
    const candidate = workspaceSlugCandidate(base, attempt);
    if (await tryClaim(candidate)) return candidate;
  }

  throw new Error("Could not claim a free workspace slug");
}
