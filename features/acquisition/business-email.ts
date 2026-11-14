const FREE_MAIL_DOMAINS = new Set([
  "aol.com",
  "bluewin.ch",
  "free.fr",
  "freenet.de",
  "gmail.com",
  "gmx.at",
  "gmx.ch",
  "gmx.com",
  "gmx.de",
  "gmx.net",
  "googlemail.com",
  "hey.com",
  "hotmail.co.uk",
  "hotmail.com",
  "hotmail.de",
  "hotmail.fr",
  "hotmail.it",
  "icloud.com",
  "interia.pl",
  "laposte.net",
  "libero.it",
  "live.com",
  "live.de",
  "mac.com",
  "mail.com",
  "mail.de",
  "mail.ru",
  "mailbox.org",
  "me.com",
  "msn.com",
  "o2.pl",
  "onet.pl",
  "orange.fr",
  "outlook.com",
  "outlook.de",
  "outlook.fr",
  "pm.me",
  "posteo.de",
  "proton.me",
  "protonmail.com",
  "qq.com",
  "t-online.de",
  "tutanota.com",
  "tuta.io",
  "uol.com.br",
  "web.de",
  "wp.pl",
  "yahoo.co.uk",
  "yahoo.com",
  "yahoo.de",
  "yahoo.fr",
  "yahoo.it",
  "yandex.com",
  "yandex.ru",
  "ziggo.nl",
  "zoho.com",
]);

export function emailDomain(email: string): string | null {
  const at = email.lastIndexOf("@");
  if (at <= 0 || at === email.length - 1) return null;
  return email
    .slice(at + 1)
    .trim()
    .toLowerCase();
}

export function isBusinessEmail(email: string): boolean {
  const domain = emailDomain(email);
  return domain !== null && !FREE_MAIL_DOMAINS.has(domain);
}
