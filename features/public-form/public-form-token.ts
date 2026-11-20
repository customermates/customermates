import { idOfSignedToken, signedIdToken } from "@/core/utils/signed-id";
import { buildLocalePath } from "@/i18n/locale-registry";

const PURPOSE = "public-form-link";

export function publicFormToken(formId: string, authSecret: string | undefined): string {
  return signedIdToken(PURPOSE, formId, authSecret);
}

export function publicFormIdFromToken(token: string, authSecret: string | undefined): string | null {
  return idOfSignedToken(PURPOSE, token, authSecret);
}

export function publicFormUrl(
  baseUrl: string,
  formId: string,
  authSecret: string | undefined,
  locale: string | null,
): string {
  const root = baseUrl.replace(/\/$/u, "");
  const path = `/f/${publicFormToken(formId, authSecret)}`;
  return `${root}${locale ? buildLocalePath(locale, path) : path}`;
}

export function publicFormEmbedSnippet(url: string, title: string): string {
  const safeTitle = title.replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;");
  return `<iframe src="${url}${url.includes("?") ? "&" : "?"}embed=1" title="${safeTitle}" width="100%" height="720" style="border:0;max-width:640px" loading="lazy"></iframe>`;
}
