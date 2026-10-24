import type { MessagingProvider, RecordIdentityProvider } from "@/generated/prisma";

const EMAIL_PROVIDERS: ReadonlyArray<RecordIdentityProvider> = ["mail", "google", "outlook"];

export function isEmailProvider(provider: RecordIdentityProvider): boolean {
  return EMAIL_PROVIDERS.includes(provider);
}

const FILEABLE_EMAIL_PROVIDERS: ReadonlyArray<MessagingProvider> = ["mail", "outlook"];

export function isFileableEmailProvider(provider: MessagingProvider): boolean {
  return FILEABLE_EMAIL_PROVIDERS.includes(provider);
}

const PHONE_PROVIDERS: ReadonlyArray<RecordIdentityProvider> = ["phone", "whatsapp"];

export function isPhoneProvider(provider: RecordIdentityProvider): boolean {
  return PHONE_PROVIDERS.includes(provider);
}

export function channelClass(provider: RecordIdentityProvider): string {
  if (isEmailProvider(provider)) return "email";
  if (isPhoneProvider(provider)) return "phone";
  return provider;
}

export function channelLabelKey(provider: RecordIdentityProvider): RecordIdentityProvider {
  return isEmailProvider(provider) ? "mail" : provider;
}

export function messagingProviderFor(provider: RecordIdentityProvider): MessagingProvider {
  return provider === "phone" ? "whatsapp" : provider;
}

export const CHANNEL_GROUPS = ["email", "phone", "social"] as const;
export type ChannelGroup = (typeof CHANNEL_GROUPS)[number];

export function channelGroup(provider: RecordIdentityProvider, value: string): ChannelGroup {
  if (isEmailProvider(provider)) return "email";
  return isPhoneProvider(provider) && /^\+[1-9]\d{6,14}$/.test(value) ? "phone" : "social";
}

export function byChannelGroup<T extends { provider: RecordIdentityProvider; value: string }>(identities: T[]): T[] {
  return CHANNEL_GROUPS.flatMap((group) =>
    identities.filter((identity) => channelGroup(identity.provider, identity.value) === group),
  );
}

const DETERMINISTIC_PROVIDERS: ReadonlyArray<RecordIdentityProvider> = [
  "mail",
  "google",
  "outlook",
  "whatsapp",
  "phone",
];

export function isDeterministicProvider(provider: RecordIdentityProvider): boolean {
  return DETERMINISTIC_PROVIDERS.includes(provider);
}

export const HANDLE_PROVIDERS: ReadonlyArray<MessagingProvider> = ["linkedin", "telegram", "instagram"];

export function isHandleProvider(provider: RecordIdentityProvider): boolean {
  return (HANDLE_PROVIDERS as ReadonlyArray<RecordIdentityProvider>).includes(provider);
}

const SOCIAL_PROVIDERS: ReadonlyArray<MessagingProvider> = ["linkedin", "instagram"];

export function isSocialProvider(provider: MessagingProvider): boolean {
  return SOCIAL_PROVIDERS.includes(provider);
}

export const LINKEDIN_PRODUCTS = ["classic", "sales_navigator", "recruiter"] as const;
export type LinkedinProduct = (typeof LINKEDIN_PRODUCTS)[number];

export const LINKEDIN_PRODUCT_PRIMARY_INBOX: Record<LinkedinProduct, string> = {
  classic: "CLASSIC_PRIMARY",
  sales_navigator: "SALES_NAVIGATOR_PRIMARY",
  recruiter: "RECRUITER_PRIMARY",
};

export function deriveLinkedinProducts(inboxIds: string[]): LinkedinProduct[] {
  return LINKEDIN_PRODUCTS.filter((product) => inboxIds.includes(LINKEDIN_PRODUCT_PRIMARY_INBOX[product]));
}

export function isUsableSenderFor(
  account: { status: string; provider: MessagingProvider },
  provider: MessagingProvider,
): boolean {
  if (account.status !== "ok") return false;
  return isEmailProvider(provider) ? isEmailProvider(account.provider) : account.provider === provider;
}

const ACCOUNT_ACTION_STATUSES: ReadonlyArray<string> = ["credentials", "permissions", "error"];

export function accountNeedsAction(account: { status: string }): boolean {
  return ACCOUNT_ACTION_STATUSES.includes(account.status);
}

export function getProviderProfileUrl(provider: RecordIdentityProvider, value: string): string | null {
  if (!value) return null;
  if (value.startsWith("http://") || value.startsWith("https://")) return value;

  const handle = value.replace(/^@/, "");

  switch (provider) {
    case "linkedin":
      return `https://www.linkedin.com/in/${handle}`;
    case "telegram":
      return `https://t.me/${handle}`;
    case "instagram":
      return `https://www.instagram.com/${handle}`;
    default:
      return null;
  }
}

export const DRAFT_THREAD_PREFIX = "draft_";

export function isDraftThreadId(unipileThreadId: string): boolean {
  return unipileThreadId.startsWith(DRAFT_THREAD_PREFIX);
}
