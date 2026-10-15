import { z } from "zod";

import { openableLinkTarget } from "@/core/validation/openable-link-target";

export type ContactKind = "email" | "phone" | "url" | "address";

const EMAIL = z.email();
const OPENSTREETMAP_SEARCH_URL = "https://www.openstreetmap.org/search";

export function contactHref(kind: ContactKind, value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (kind === "email") return EMAIL.safeParse(trimmed).success ? `mailto:${trimmed}` : null;
  if (kind === "address") return `${OPENSTREETMAP_SEARCH_URL}?${new URLSearchParams({ query: trimmed })}`;
  if (kind === "phone") {
    const dialable = trimmed.replace(/[\s().-]/g, "");
    return /^\+?[1-9]\d{2,14}$/.test(dialable) ? `tel:${dialable}` : null;
  }
  const target = openableLinkTarget(trimmed);
  return target && /^https?:/i.test(target) ? target : null;
}
