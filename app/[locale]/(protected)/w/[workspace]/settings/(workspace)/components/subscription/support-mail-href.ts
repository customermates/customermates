import { contactHref } from "@/core/utils/contact-href";

const SUPPORT_EMAIL = "mail@customermates.com";

export function supportMailHref(subject: string): string | null {
  const href = contactHref("email", SUPPORT_EMAIL);
  return href ? `${href}?subject=${encodeURIComponent(subject)}` : null;
}
