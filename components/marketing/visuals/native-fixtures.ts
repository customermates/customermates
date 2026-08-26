import { AUTHORABLE_AI_CLIENT_IDENTITIES } from "@/components/ai-connection/ai-client-identities";
import { DEFAULT_LOCALE, formattingTagFor } from "@/i18n/locale-registry";

import {
  DEMO_VISUAL_DEALS,
  DEMO_VISUAL_DEAL_STATUSES,
  DEMO_VISUAL_PEOPLE,
  DEMO_VISUAL_PROVIDER_PERSON_PAIRINGS,
  type DemoVisualPersonRole,
} from "./demo-visual-catalog";

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

export const VISUAL_AGENT_PROVIDER_FIXTURES = AUTHORABLE_AI_CLIENT_IDENTITIES;

export const VISUAL_PERSON_FIXTURES = DEMO_VISUAL_PEOPLE;

export const VISUAL_STATUS_FIXTURES = DEMO_VISUAL_DEAL_STATUSES;

export const VISUAL_RECORD_FIXTURES = DEMO_VISUAL_DEALS;

export const VISUAL_RECORD_ASSIGNEE_FIXTURES = Object.fromEntries(
  Object.entries(VISUAL_RECORD_FIXTURES).map(([record, { assignee }]) => [record, assignee]),
) as {
  [Record in keyof typeof VISUAL_RECORD_FIXTURES]: (typeof VISUAL_RECORD_FIXTURES)[Record]["assignee"];
};

export const VISUAL_PROVIDER_PERSON_PAIRINGS: Partial<
  Record<keyof typeof VISUAL_PROVIDER_FIXTURES, readonly (keyof typeof VISUAL_PERSON_FIXTURES)[]>
> = {
  ...DEMO_VISUAL_PROVIDER_PERSON_PAIRINGS,
};

export type VisualProviderFixtureId = keyof typeof VISUAL_PROVIDER_FIXTURES;
export type VisualAgentProviderFixtureId = keyof typeof VISUAL_AGENT_PROVIDER_FIXTURES;
export type VisualPersonFixtureId = keyof typeof VISUAL_PERSON_FIXTURES;
export type VisualStatusFixtureId = keyof typeof VISUAL_STATUS_FIXTURES;
export type VisualRecordFixtureId = keyof typeof VISUAL_RECORD_FIXTURES;
export type VisualPersonRole = DemoVisualPersonRole;

type FixtureEntry<T extends Record<string, object>> = {
  [Id in keyof T & string]: { id: Id } & T[Id];
}[keyof T & string];

const VISUAL_FIXTURE_SORTING_LOCALE = formattingTagFor(DEFAULT_LOCALE);

function fixtureEntries<T extends Record<string, object>>(fixtures: T): FixtureEntry<T>[] {
  return Object.entries(fixtures)
    .map(([id, fixture]) => ({ id, ...fixture }) as FixtureEntry<T>)
    .sort((left, right) => left.id.localeCompare(right.id, VISUAL_FIXTURE_SORTING_LOCALE));
}

export function listVisualAgentProviders() {
  return fixtureEntries(VISUAL_AGENT_PROVIDER_FIXTURES);
}

export function listVisualPeople(options: { provider?: VisualProviderFixtureId; role?: VisualPersonRole } = {}) {
  const permittedPeople = options.provider ? VISUAL_PROVIDER_PERSON_PAIRINGS[options.provider] : undefined;

  return fixtureEntries(VISUAL_PERSON_FIXTURES).filter(({ id, roles }) => {
    const hasProvider = !options.provider || Boolean(permittedPeople?.includes(id));
    const hasRole = !options.role || (roles as readonly VisualPersonRole[]).includes(options.role);
    return hasProvider && hasRole;
  });
}

export function listVisualRecords(
  options: {
    assignee?: VisualPersonFixtureId;
    status?: VisualStatusFixtureId;
  } = {},
) {
  return fixtureEntries(VISUAL_RECORD_FIXTURES).filter(
    ({ assignee, status }) =>
      (!options.assignee || assignee === options.assignee) && (!options.status || status === options.status),
  );
}

export function getNativeVisualFixtureCatalog() {
  const providerPersonPairings = Object.entries(VISUAL_PROVIDER_PERSON_PAIRINGS)
    .flatMap(([provider, people]) =>
      (people ?? []).map((person) => ({
        person,
        provider: provider as VisualProviderFixtureId,
      })),
    )
    .sort((left, right) =>
      `${left.provider}:${left.person}`.localeCompare(
        `${right.provider}:${right.person}`,
        VISUAL_FIXTURE_SORTING_LOCALE,
      ),
    );

  return {
    agentProviders: listVisualAgentProviders(),
    channelProviders: fixtureEntries(VISUAL_PROVIDER_FIXTURES),
    people: listVisualPeople(),
    providerPersonPairings,
    records: listVisualRecords(),
    statuses: fixtureEntries(VISUAL_STATUS_FIXTURES),
  };
}

export const APPROVED_NATIVE_VISUAL_ASSETS = [
  ...Object.values(VISUAL_PROVIDER_FIXTURES).map(({ asset }) => asset),
  ...Object.values(VISUAL_PERSON_FIXTURES).map(({ asset }) => asset),
  "/images/brand/gemini-sparkle.svg",
] as const;

export const NATIVE_VISUAL_FIXTURE_SOURCES = [
  "app/[locale]/(static)/components/homepage-stats-row.tsx",
  "app/[locale]/(static)/components/homepage-hero.tsx",
  "components/ai-connection/ai-client-identities.ts",
  "components/ai-connection/ai-client-logo.tsx",
  "components/icons/channel-icon.tsx",
  "components/marketing/visuals/demo-visual-catalog.ts",
  "components/ui/avatar.tsx",
  "components/ui/badge.tsx",
  "prisma/seeds/avatars.ts",
  "prisma/seeds/custom-fields.ts",
  "prisma/seeds/deals.ts",
  "prisma/seeds/members.ts",
  "prisma/seeds/messaging/fixtures.ts",
  "prisma/seeds/relationships.ts",
] as const;
