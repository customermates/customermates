export const VISUAL_PROVIDER_FIXTURES = {
  gmail: {
    asset: "/icons/channels/google.svg",
    name: "Gmail",
  },
  imap: {
    asset: "/icons/channels/mail.svg",
    name: "IMAP",
  },
  instagram: {
    asset: "/icons/channels/instagram.svg",
    name: "Instagram",
  },
  linkedin: {
    asset: "/icons/channels/linkedin.svg",
    name: "LinkedIn",
  },
  outlook: {
    asset: "/icons/channels/outlook.svg",
    name: "Outlook",
  },
  telegram: {
    asset: "/icons/channels/telegram.svg",
    name: "Telegram",
  },
  whatsapp: {
    asset: "/icons/channels/whatsapp.svg",
    name: "WhatsApp",
  },
} as const;

export const VISUAL_AGENT_PROVIDER_FIXTURES = {
  chatgpt: {
    name: "ChatGPT",
  },
  claude: {
    name: "Claude",
  },
  gemini: {
    name: "Gemini",
  },
} as const;

export const VISUAL_PERSON_FIXTURES = {
  "anna-mueller": {
    asset: "/demo/avatars/photos/anna-mueller.png",
    name: "Anna Müller",
  },
  "leon-becker": {
    asset: "/demo/avatars/photos/leon-becker.png",
    name: "Leon Becker",
  },
  "max-bergmann": {
    asset: "/demo/avatars/photos/max-bergmann.png",
    name: "Max Bergmann",
  },
  "sophie-wagner": {
    asset: "/demo/avatars/photos/sophie-wagner.png",
    name: "Sophie Wagner",
  },
} as const;

export const VISUAL_STATUS_FIXTURES = {
  "deal-open": {
    label: "Open",
    variant: "warning",
  },
  "deal-won": {
    label: "Won",
    variant: "success",
  },
  "deal-lost": {
    label: "Lost",
    variant: "destructive",
  },
  "deal-abandoned": {
    label: "Abandoned",
    variant: "secondary",
  },
} as const;

export const VISUAL_RECORD_FIXTURES = {
  "deal-crm-rollout": {
    kind: "deal",
    name: "CRM Rollout & Sales Enablement",
    status: "deal-won",
  },
  "deal-data-analytics": {
    kind: "deal",
    name: "Data & Analytics Transformation",
    status: "deal-open",
  },
  "deal-process-automation": {
    kind: "deal",
    name: "Process Automation Program",
    status: "deal-lost",
  },
} as const satisfies Record<
  string,
  {
    kind: "deal";
    name: string;
    status: keyof typeof VISUAL_STATUS_FIXTURES;
  }
>;

export const VISUAL_RECORD_ASSIGNEE_FIXTURES = {
  "deal-data-analytics": "max-bergmann",
} as const satisfies Partial<Record<keyof typeof VISUAL_RECORD_FIXTURES, keyof typeof VISUAL_PERSON_FIXTURES>>;

export const VISUAL_PROVIDER_PERSON_PAIRINGS: Partial<
  Record<keyof typeof VISUAL_PROVIDER_FIXTURES, readonly (keyof typeof VISUAL_PERSON_FIXTURES)[]>
> = {
  gmail: ["anna-mueller"],
  linkedin: ["leon-becker"],
  whatsapp: ["sophie-wagner"],
};

export type VisualProviderFixtureId = keyof typeof VISUAL_PROVIDER_FIXTURES;
export type VisualAgentProviderFixtureId = keyof typeof VISUAL_AGENT_PROVIDER_FIXTURES;
export type VisualPersonFixtureId = keyof typeof VISUAL_PERSON_FIXTURES;
export type VisualStatusFixtureId = keyof typeof VISUAL_STATUS_FIXTURES;
export type VisualRecordFixtureId = keyof typeof VISUAL_RECORD_FIXTURES;

export const APPROVED_NATIVE_VISUAL_ASSETS = [
  ...Object.values(VISUAL_PROVIDER_FIXTURES).map(({ asset }) => asset),
  ...Object.values(VISUAL_PERSON_FIXTURES).map(({ asset }) => asset),
  "/images/brand/gemini-sparkle.svg",
] as const;

export const NATIVE_VISUAL_FIXTURE_SOURCES = [
  "app/[locale]/(static)/components/homepage-stats-row.tsx",
  "app/[locale]/(static)/components/homepage-hero.tsx",
  "components/ai-connection/ai-client-logo.tsx",
  "components/icons/channel-icon.tsx",
  "components/ui/avatar.tsx",
  "components/ui/badge.tsx",
  "prisma/seeds/avatars.ts",
  "prisma/seeds/custom-fields.ts",
  "prisma/seeds/deals.ts",
  "prisma/seeds/members.ts",
  "prisma/seeds/messaging/fixtures.ts",
  "prisma/seeds/relationships.ts",
] as const;
