export type ContactKind = "email" | "phone" | "url";

export function contactHref(kind: ContactKind, value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (kind === "email") return `mailto:${trimmed}`;
  if (kind === "phone") {
    const dialable = trimmed.replace(/[^\d+]/g, "");
    return dialable ? `tel:${dialable}` : null;
  }
  const href = /^[a-z][a-z\d+.-]*:/i.test(trimmed) ? trimmed : `https://${trimmed}`;
  return /^(https?|mailto|tel):/i.test(href) ? href : null;
}
