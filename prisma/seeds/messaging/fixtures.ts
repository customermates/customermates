export type MessagingFixtureProvider = "google" | "instagram" | "linkedin" | "outlook" | "telegram" | "whatsapp";

export type PersonFixture = {
  avatarPath?: string;
  displayName: string;
  email?: string;
  headline?: string;
  instagram?: string;
  instagramProfileUrl?: string;
  linkedin?: string;
  occupation?: string;
  phone?: string;
  profileUrl?: string;
  telegram?: string;
  telegramProfileUrl?: string;
};

export type MessageFixture = {
  /** A person key, or `self` for the workspace member who owns the accounts. */
  sender: string;
  text: string;
  html?: string;
  draft?: boolean;
  reaction?: { sender: string; value: string };
};

export type ThreadFixture = {
  account: MessagingFixtureProvider;
  latestMinutesAgo: number;
  messages: MessageFixture[];
  name: string | null;
  participants: string[];
  state: "open" | "unread";
  subject: string | null;
  type: "single" | "group";
  /** Records the conversation is explicitly linked to. */
  links: ReadonlyArray<{ typeId: string; recordId: string }>;
};

export type CalendarFixture = {
  name: string;
  timezone: string;
  events: ReadonlyArray<{
    attendees: ReadonlyArray<{ person: string; responseStatus: "maybe" | "yes" }>;
    durationMinutes: number;
    startsMinutesAgo: number;
    title: string;
  }>;
};

export type AccountActivityFixture = { person: string; occurredMinutesAgo: number };

/** The conversations of one demo workspace: its connected accounts, the people in them and their threads. */
export type WorkspaceMessagingFixtures = {
  companyId: string;
  userId: string;
  seedUserEmail: string;
  /** Namespace of the fixture ids; the team workspace keeps the historical `0000` ids and account names. */
  tag: string;
  self: { name: string; title: string; companyName: string; website: string; avatarPath: string };
  accounts: readonly MessagingFixtureProvider[];
  people: Readonly<Record<string, PersonFixture>>;
  threads: readonly ThreadFixture[];
  calendar: CalendarFixture | null;
  linkedinActivities: readonly AccountActivityFixture[];
};
