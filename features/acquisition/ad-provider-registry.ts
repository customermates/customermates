const DAY_SECONDS = 60 * 60 * 24;

export const AD_PROVIDER_ORDER = ["google_ads", "openai_ads", "reddit_ads", "linkedin_ads"] as const;
export type AdProvider = (typeof AD_PROVIDER_ORDER)[number];

export type AdProviderDefinition = {
  displayName: string;
  identifierKinds: readonly [string, ...string[]];
  clickRetentionSeconds: number;
  maxReportAgeFromClickSeconds: number | null;
  maxReportAgeFromConversionSeconds: number | null;
};

export const AD_PROVIDERS = {
  google_ads: {
    displayName: "Google",
    identifierKinds: ["gclid", "gbraid", "wbraid"],
    clickRetentionSeconds: 89 * DAY_SECONDS,
    maxReportAgeFromClickSeconds: 89 * DAY_SECONDS,
    maxReportAgeFromConversionSeconds: null,
  },
  openai_ads: {
    displayName: "ChatGPT",
    identifierKinds: ["oppref"],
    clickRetentionSeconds: 30 * DAY_SECONDS,
    maxReportAgeFromClickSeconds: null,
    maxReportAgeFromConversionSeconds: 7 * DAY_SECONDS,
  },
  reddit_ads: {
    displayName: "Reddit",
    identifierKinds: ["rdt_cid"],
    clickRetentionSeconds: 30 * DAY_SECONDS,
    maxReportAgeFromClickSeconds: null,
    maxReportAgeFromConversionSeconds: 7 * DAY_SECONDS,
  },
  linkedin_ads: {
    displayName: "LinkedIn",
    identifierKinds: ["li_fat_id"],
    clickRetentionSeconds: 89 * DAY_SECONDS,
    maxReportAgeFromClickSeconds: null,
    maxReportAgeFromConversionSeconds: 89 * DAY_SECONDS,
  },
} as const satisfies Record<AdProvider, AdProviderDefinition>;

export type AdIdentifierKind = (typeof AD_PROVIDERS)[AdProvider]["identifierKinds"][number];

export const AD_IDENTIFIER_KINDS = AD_PROVIDER_ORDER.flatMap((provider) => AD_PROVIDERS[provider].identifierKinds);

const PROVIDER_BY_KIND = new Map<string, AdProvider>(
  AD_PROVIDER_ORDER.flatMap((provider) =>
    AD_PROVIDERS[provider].identifierKinds.map((kind) => [kind, provider] as const),
  ),
);

export function adProviderForIdentifierKind(kind: string): AdProvider | null {
  return PROVIDER_BY_KIND.get(kind) ?? null;
}

export function isAdProvider(value: string): value is AdProvider {
  return (AD_PROVIDER_ORDER as readonly string[]).includes(value);
}

export function adProviderDisplayName(provider: AdProvider): string {
  return AD_PROVIDERS[provider].displayName;
}

export function adClickRetentionDays(provider: AdProvider): number {
  return Math.floor(AD_PROVIDERS[provider].clickRetentionSeconds / DAY_SECONDS);
}

export function adClickExpiresAt(provider: AdProvider, clickedAt: Date): Date {
  return new Date(clickedAt.getTime() + AD_PROVIDERS[provider].clickRetentionSeconds * 1000);
}

export function isAdConversionReportable(args: {
  provider: AdProvider;
  clickedAt: Date;
  conversionAt: Date;
  now: Date;
}): boolean {
  const definition = AD_PROVIDERS[args.provider];

  if (definition.maxReportAgeFromClickSeconds !== null) {
    const sinceClick = args.now.getTime() - args.clickedAt.getTime();
    if (sinceClick > definition.maxReportAgeFromClickSeconds * 1000) return false;
  }

  if (definition.maxReportAgeFromConversionSeconds !== null) {
    const sinceConversion = args.now.getTime() - args.conversionAt.getTime();
    if (sinceConversion > definition.maxReportAgeFromConversionSeconds * 1000) return false;
  }

  return args.conversionAt.getTime() >= args.clickedAt.getTime();
}
