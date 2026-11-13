import { emailDomain } from "@/features/acquisition/business-email";

type EmailChannelKey = "google" | "outlook" | "imap";

const MICROSOFT_DOMAINS = new Set([
  "hotmail.co.uk",
  "hotmail.com",
  "hotmail.de",
  "hotmail.fr",
  "hotmail.it",
  "live.com",
  "live.de",
  "msn.com",
  "outlook.com",
  "outlook.de",
  "outlook.fr",
]);

export function orderedEmailChannels(email: string): EmailChannelKey[] {
  const domain = emailDomain(email);
  return domain !== null && MICROSOFT_DOMAINS.has(domain)
    ? ["outlook", "google", "imap"]
    : ["google", "outlook", "imap"];
}
