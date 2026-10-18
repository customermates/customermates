import { localE2eEnvironment } from "./local-environment";
import { readLocalEmails } from "./local-resend-provider.mjs";

export type SentEmail = {
  id: string;
  createdAt: string;
  from: string;
  to: string[];
  subject: string;
  html: string;
  text: string | null;
};

export function sentEmailsTo(address: string): SentEmail[] {
  return (readLocalEmails(localE2eEnvironment().providerDirectory) as SentEmail[]).filter((email) =>
    email.to.includes(address),
  );
}

export function emailLanguage(email: SentEmail) {
  return /<html\b[^>]*\blang="([^"]+)"/.exec(email.html)?.[1] ?? null;
}

export function emailLinks(email: SentEmail) {
  return [...email.html.matchAll(/<a\b[^>]*\bhref="([^"]+)"/g)].map((match) => match[1].replaceAll("&amp;", "&"));
}

export function emailText(email: SentEmail) {
  return email.html
    .replace(/<head\b[\s\S]*?<\/head>/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;|&#xA0;/g, " ")
    .replace(/&quot;/g, '"')
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}
