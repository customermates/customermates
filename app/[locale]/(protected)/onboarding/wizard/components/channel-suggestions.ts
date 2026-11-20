import { FREE_MAIL_DOMAINS, emailDomain } from "@/features/acquisition/business-email";

type EmailChannelKey = "google" | "outlook" | "imap";

const MICROSOFT_MAIL_HOST = /^(?:hotmail|live|msn|outlook)\./u;
const MICROSOFT_DOMAINS = new Set([...FREE_MAIL_DOMAINS].filter((domain) => MICROSOFT_MAIL_HOST.test(domain)));

export function orderedEmailChannels(email: string): EmailChannelKey[] {
  const domain = emailDomain(email);
  return domain !== null && MICROSOFT_DOMAINS.has(domain)
    ? ["outlook", "google", "imap"]
    : ["google", "outlook", "imap"];
}
