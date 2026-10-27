import type { ChipColor } from "@/constants/chip-colors";
import type { SolutionDataLocale, SolutionId } from "@/core/solutions/solution-catalog";
import type { DisplayType } from "@/features/widget/widget-display.schema";
import type { RoutineTriggerEvent } from "@/ee/routines/routine-trigger-events";

import type { TEAM_MEMBER_IDS } from "../team";

/** Starter lists a solution can keep (relabelled); every other list of a solution is a custom list. */
export const PRESET_LIST_KEYS = ["organization", "contact", "deal", "service", "task"] as const;
export type PresetListKey = (typeof PRESET_LIST_KEYS)[number];

/** The two colleagues a non-team workspace may add beside Max. */
export const COLLEAGUE_KEYS = ["colleagueA", "colleagueB"] as const;
export type ColleagueKey = (typeof COLLEAGUE_KEYS)[number];

export type MemberKey = keyof typeof TEAM_MEMBER_IDS | ColleagueKey;

export type FieldType =
  | "text"
  | "richText"
  | "number"
  | "currency"
  | "boolean"
  | "date"
  | "select"
  | "multiSelect"
  | "url"
  | "member"
  | "dateTime"
  | "dateRange"
  | "dateTimeRange"
  | "address"
  | "file";

export type OptionSpec = { key: string; label: string; color: ChipColor; probability?: number };

export type ListSpec = {
  key: string;
  label: string;
  pluralLabel: string;
  description: string;
  icon: string;
};

export type FieldSpec = {
  /** `<list>.<name>`, also the `presetId` key of the field. */
  key: string;
  label: string;
  type: FieldType;
  options?: OptionSpec[];
  /** Weighted value, days open and similar calculations; inputs leave it unset. */
  formula?: FormulaSpec;
  /** A field already in Trash. */
  archived?: boolean;
};

export type FormulaSpec =
  | { kind: "weighted"; value: string; select: string }
  | { kind: "daysBetween"; from: string; to: string }
  | { kind: "product"; left: string; right: string | number }
  | { kind: "difference"; left: string; right: string }
  | { kind: "rollupSum"; relation: string; field: string };

export type RelationshipSpec = {
  /** `<source>.<name>`, also the `presetId` key. */
  key: string;
  source: string;
  target: string;
  sourceCardinality: "one" | "many";
  targetCardinality: "one" | "many";
  /** Show the conversations of linked contacts on this relationship's records. */
  messages?: "source" | "target";
};

/** A day relative to the authored story end: negative is earlier, positive later. */
export type DayRef = { day: number };
export const day = (offset: number): DayRef => ({ day: offset });

/** A local time on a story day, `HH:mm` in the workspace's time zone. */
export type AtRef = { day: number; at: string };
export const at = (offset: number, time: string): AtRef => ({ day: offset, at: time });

/** A span of whole story days, both ends included. */
export type RangeRef = { from: number; to: number };
export const range = (from: number, to: number): RangeRef => ({ from, to });

/** A span that starts at a local time on a story day and lasts `minutes`. */
export type RangeAtRef = { day: number; at: string; minutes: number };
export const rangeAt = (offset: number, time: string, minutes: number): RangeAtRef => ({
  day: offset,
  at: time,
  minutes,
});

/**
 * A typed-in address: real city and postal code with a common street, stored unverified at the approximate centre of
 * its postal code (`lat`/`lon`), as the server stores a typed address; maps place it there.
 */
export type AddressInput = {
  street: string;
  line2?: string;
  postalCode: string;
  city: string;
  region?: string;
  countryCode: string;
  lat: number;
  lon: number;
};
export const address = (input: AddressInput): AddressInput => input;

export type FieldInput =
  | string
  | number
  | boolean
  | DayRef
  | AtRef
  | RangeRef
  | RangeAtRef
  | AddressInput
  | readonly string[];

export type ChannelSpec = {
  email?: string;
  phone?: string;
  linkedin?: string;
  linkedinUrl?: string;
  instagram?: string;
  telegram?: string;
};

export type RecordSpec = {
  key: string;
  values: Record<string, FieldInput>;
  /** Relationship key to the keys of the linked target records. */
  links?: Record<string, string | readonly string[]>;
  /** Line items as `[service key, quantity]`, for deals of lists with services. */
  lines?: ReadonlyArray<readonly [service: string, quantity: number]>;
  owner?: MemberKey;
  channels?: ChannelSpec;
  avatar?: string;
  createdDaysAgo: number;
  /** Earlier values of fields that changed later, oldest first: each entry is one update. */
  history?: ReadonlyArray<{ daysAgo: number; by?: MemberKey; previous: Record<string, FieldInput> }>;
};

export type ViewFilterSpec = { field: string; in?: readonly string[]; notIn?: readonly string[] };

export type ViewSpec = {
  key: string;
  list: string;
  name: string;
  mode: "board" | "table" | "calendar";
  /** Calendar views: the field that places each record, an optional end field, a select that colours the entries. */
  calendar?: { date: string; end?: string; color?: string; mode: "month" | "week" | "agenda" };
  groupBy?: string;
  columns: readonly string[];
  filters?: readonly ViewFilterSpec[];
  sort?: { field: string; direction: "asc" | "desc" };
};

/**
 * A widget filter on a field of the widget's list, or on `system:createdAt`/`system:updatedAt`: options in or not in a
 * select, a date at most `withinDays` days back (or later), a date more than `olderThanDays` days back, or an empty
 * value.
 */
export type WidgetFilterSpec = {
  field: string;
  in?: readonly string[];
  notIn?: readonly string[];
  withinDays?: number;
  olderThanDays?: number;
  empty?: true;
};

/** Group by a field, a month of a date, the records a relationship links to (or a `<list>.<field>` of them), the assignees or each record. */
export type WidgetGroupSpec =
  | { field: string }
  | { relation: string; field?: string }
  | { month: string }
  | { assignee: true }
  | { records: true };

/**
 * The dashboard has a fixed shape: four number cards, then two rows of three widgets, so a solution lists exactly four
 * `kpi` widgets followed by six chart, calendar, map or activity widgets.
 */
export type WidgetSpec =
  | {
      kind: "kpi";
      title: string;
      list: string;
      aggregation: "count" | "sum" | "average" | "max";
      field?: string;
      filters?: readonly WidgetFilterSpec[];
    }
  | {
      kind: "chart";
      title: string;
      display: DisplayType;
      list: string;
      aggregation: "count" | "sum" | "average";
      field?: string;
      groupBy: WidgetGroupSpec;
      filters?: readonly WidgetFilterSpec[];
    }
  | {
      /** Upcoming lists the records of the next `days` with an overdue section; month is a heat grid of the month. */
      kind: "calendar";
      title: string;
      list: string;
      layout: "upcoming" | "month";
      date: string;
      days?: number;
      amount?: string;
      overdue?: boolean;
      filters?: readonly WidgetFilterSpec[];
    }
  | {
      kind: "map";
      title: string;
      list: string;
      address: string;
      color?: string;
      size?: string;
      detail?: string;
      filters?: readonly WidgetFilterSpec[];
    }
  | {
      /** The latest messages of the workspace's conversations, optionally of some channels only. */
      kind: "activity";
      title: string;
      providers?: readonly MessagingProvider[];
    };

export type WikiPageSpec = {
  key: string;
  title: string;
  kind: "guide" | "knowledge" | "procedure";
  whenToUse?: string;
  markdown: readonly string[];
};

export type MessagingProvider = "google" | "outlook" | "linkedin" | "whatsapp" | "instagram" | "telegram";

export type MessageSpec = {
  /** `self` or the key of a contact record. */
  from: string;
  text: string;
  /** The HTML body of an email as the sender's mail client wrote it; `text` stays its plain-text part. */
  html?: string;
  draft?: boolean;
  reaction?: { from: string; value: string };
};

export type ThreadSpec = {
  account: MessagingProvider;
  /** Contact record keys of the people in the conversation. */
  with: readonly string[];
  subject?: string;
  name?: string;
  state: "open" | "unread";
  latestMinutesAgo: number;
  messages: readonly MessageSpec[];
  /** Records the conversation is explicitly linked to, as `<list>:<record key>`. */
  links?: readonly string[];
};

export type CalendarEventSpec = {
  title: string;
  with: readonly string[];
  startsMinutesAgo: number;
  durationMinutes: number;
};

export type MessagingSpec = {
  accounts: readonly MessagingProvider[];
  /** Max's job title and the sign-off of outgoing email. */
  selfTitle: string;
  website: string;
  threads: readonly ThreadSpec[];
  calendar?: { name: string; events: readonly CalendarEventSpec[] };
};

/** A synthetic colleague of Max in a non-team workspace; never signs in. */
export type ColleagueSpec = { key: ColleagueKey; firstName: string; lastName: string; email: string; avatar: string };

export type RoutineRunSpec = {
  status: "succeeded" | "failed" | "blocked";
  startedHoursAgo: number;
  durationSeconds: number;
  credits: number;
  /** What the run reported; a failed or blocked run gives the note Mate wrote instead. */
  summary?: string;
  note?: string;
  error?: "providerUnavailable" | "creditLimitReached";
};

/** What a routine reacts to; a sample names the record (`<list>:<key>`) or conversation (thread index) of its runs. */
export type RoutineTriggerSpec =
  | { kind: "schedule"; cron: string }
  | {
      kind: "event";
      events: readonly RoutineTriggerEvent[];
      lists?: readonly string[];
      debounceSeconds: number;
      sample?: { record: string } | { thread: number };
    };

/** A Mate routine of the workspace with its run history; routines draft and create tasks or notes, never send. */
export type RoutineSpec = {
  key: string;
  name: string;
  /** The task part of the prompt; the shared CRM protocol follows it. */
  task: string;
  owner?: MemberKey;
  enabled?: boolean;
  trigger: RoutineTriggerSpec;
  runs: readonly RoutineRunSpec[];
};

/** A webhook on record changes of some lists, with its most recent deliveries (all failing when paused). */
export type WebhookSpec = {
  key: string;
  description: string;
  url: string;
  enabled: boolean;
  lists: readonly string[];
  createdDaysAgo: number;
  deliveries: number;
};

/** An API key on Max's profile, shown in the settings; it cannot authenticate. */
export type ApiKeySpec = { name: string; createdDaysAgo: number };

export type FileKind = "pdf" | "docx" | "xlsx" | "csv" | "md" | "jpg";

/**
 * A file on a record's file field. Documents are generated from their text: `lines` for PDF, Word and Markdown (a line
 * starting with `# ` or `## ` is a heading, a line starting with `| ` a table row), `rows` for spreadsheets and CSV,
 * `photo` for a committed JPG of `assets/photos`. Every byte is derived from the spec, so reseeds store the same files.
 */
export type FileSpec = {
  key: string;
  /** `<list>:<record key>` */
  record: string;
  /** The file field, `<list>.<field>`. */
  field: string;
  name: string;
  kind: FileKind;
  lines?: readonly string[];
  rows?: ReadonlyArray<ReadonlyArray<string | number>>;
  photo?: string;
  uploadedDaysAgo: number;
  by?: MemberKey;
};

/** A source of the combined calendar: a list's date field, optional end field, filters and the entries' colour. */
export type PlannerSourceSpec = {
  list: string;
  date: string;
  end?: string;
  filters?: readonly ViewFilterSpec[];
  color: ChipColor;
};

/** Max's combined calendar: record sources, the connected calendar when the workspace has one, and its mode. */
export type PlannerSpec = {
  sources: readonly PlannerSourceSpec[];
  connectedCalendar?: boolean;
  mode: "month" | "week" | "quarter" | "timeline" | "agenda";
  /** A private calendar feed Max subscribed to on their phone. */
  feed?: string;
};

/** A record Max deleted a few days ago; it waits in Trash. */
export type TrashSpec = { list: string; name: string; daysAgo: number };

/** A finished Mate conversation of Max. */
export type MateChatSpec = {
  title: string;
  endedHoursAgo: number;
  messages: ReadonlyArray<{ role: "user" | "assistant"; text: string }>;
};

export type SolutionContent = {
  /** The workspace name: the solution name, so the workspace reads as an example. */
  workspaceName: string;
  /** The fictional company of the story, named in the Operating Guide and email signatures. */
  companyName: string;
  lists: readonly ListSpec[];
  fields: readonly FieldSpec[];
  /** Options of the deal stage field, in board order. */
  stages: readonly OptionSpec[];
  relationships?: readonly RelationshipSpec[];
  records: Record<string, readonly RecordSpec[]>;
  views: readonly ViewSpec[];
  dashboard: { widgets: readonly WidgetSpec[] };
  wiki: readonly WikiPageSpec[];
  messaging?: MessagingSpec;
  /** The deal value as a calculation, for solutions without a Services list (otherwise a plain input). */
  dealValue?: FormulaSpec;
  /** Labels of the deal value and weighted value when the solution names them itself ("Fee", "ARR"). */
  valueLabels?: { value: string; weighted: string };
  members?: readonly ColleagueSpec[];
  routines?: readonly RoutineSpec[];
  webhooks?: readonly WebhookSpec[];
  apiKeys?: readonly ApiKeySpec[];
  /** The currency of every amount: USD for US stories, GBP for UK stories, EUR for German ones. */
  currency: "USD" | "GBP" | "EUR";
  /** The time zone of the story: dashboards, calendars and local times of date-time values. */
  timeZone: string;
  files?: readonly FileSpec[];
  planner?: PlannerSpec;
  /** Records in Trash; the team workspace keeps its own Trash fixtures. */
  trash?: readonly TrashSpec[];
  /** Mate conversations; the team workspace keeps its own. */
  mateChats?: readonly MateChatSpec[];
};

/** Where a story is set: the currency of its amounts and its time zone, per data locale. */
export type SolutionStory = Pick<SolutionContent, "currency" | "timeZone">;

export type SolutionDefinition<Strings> = {
  id: SolutionId;
  strings: Record<SolutionDataLocale, Strings>;
  story: Record<SolutionDataLocale, SolutionStory>;
  build: (strings: Strings, locale: SolutionDataLocale) => Omit<SolutionContent, keyof SolutionStory>;
};

/**
 * One solution: the structure (lists, fields, relationships, records, links, owners and dates) is written once in
 * `build`, and every visible text comes from the string table of the data locale, so EN and DE share the structure.
 */
export function defineSolution<Strings>(definition: SolutionDefinition<Strings>): SolutionDefinition<Strings> {
  return definition;
}

/** Any solution definition, whatever its string table. */
export type AnySolutionDefinition = {
  id: SolutionId;
  strings: Record<SolutionDataLocale, unknown>;
  story: Record<SolutionDataLocale, SolutionStory>;
  build: (strings: never, locale: SolutionDataLocale) => Omit<SolutionContent, keyof SolutionStory>;
};

export function solutionContent(definition: AnySolutionDefinition, locale: SolutionDataLocale): SolutionContent {
  const build = definition.build as (
    strings: unknown,
    locale: SolutionDataLocale,
  ) => Omit<SolutionContent, keyof SolutionStory>;
  return { ...build(definition.strings[locale], locale), ...definition.story[locale] };
}

export { demoContactPhoto as photo, type DemoContactPhoto } from "../avatars";

/** Fictional phone numbers: templates whose trailing `#` run takes a zero-padded running number. */
export type PhonePlan = { templates: readonly string[]; start: number };

export function phoneNumber(plan: PhonePlan, index: number): string {
  const template = plan.templates[index % plan.templates.length];
  const digits = /#+$/.exec(template)?.[0].length ?? 0;
  return template.slice(0, template.length - digits) + String(plan.start + index).padStart(digits, "0");
}

/** An amount with grouped thousands, as the story's country writes it: `groupDigits(16400, ",")` is "16,400". */
export function groupDigits(amount: number, thousands: string, decimal = "."): string {
  const [whole, fraction] = String(Math.abs(amount)).split(".");
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/gu, thousands);
  return `${amount < 0 ? "-" : ""}${grouped}${fraction ? `${decimal}${fraction}` : ""}`;
}
