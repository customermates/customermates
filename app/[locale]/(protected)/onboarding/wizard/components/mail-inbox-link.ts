type MailInbox = { name: string; url: string };

const INBOXES: ReadonlyArray<{ domains: readonly string[]; inbox: MailInbox }> = [
  {
    domains: ["gmail.com", "googlemail.com"],
    inbox: { name: "Gmail", url: "https://mail.google.com/mail/u/0/#inbox" },
  },
  {
    domains: ["outlook.com", "hotmail.com", "live.com", "msn.com", "outlook.de", "hotmail.de"],
    inbox: { name: "Outlook", url: "https://outlook.live.com/mail/0/" },
  },
  { domains: ["yahoo.com", "yahoo.de", "ymail.com"], inbox: { name: "Yahoo Mail", url: "https://mail.yahoo.com/" } },
  { domains: ["icloud.com", "me.com", "mac.com"], inbox: { name: "iCloud Mail", url: "https://www.icloud.com/mail" } },
  { domains: ["gmx.de", "gmx.net", "gmx.at", "gmx.ch"], inbox: { name: "GMX", url: "https://www.gmx.net/" } },
  { domains: ["web.de"], inbox: { name: "WEB.DE", url: "https://web.de/" } },
  { domains: ["proton.me", "protonmail.com"], inbox: { name: "Proton Mail", url: "https://mail.proton.me/" } },
];

export function mailInboxFor(email: string): MailInbox | null {
  const domain = email
    .slice(email.lastIndexOf("@") + 1)
    .trim()
    .toLowerCase();
  return INBOXES.find((entry) => entry.domains.includes(domain))?.inbox ?? null;
}
