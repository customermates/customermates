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
  | "email"
  | "phone"
  | "url"
  | "member";

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

export type FieldInput = string | number | boolean | DayRef | readonly string[];

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
  mode: "board" | "table";
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
 * The dashboard has a fixed shape: four number cards, then three charts in a row and two wider charts below them, so a
 * solution lists exactly four `kpi` widgets followed by five `chart` widgets.
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
  members?: readonly ColleagueSpec[];
  routines?: readonly RoutineSpec[];
  webhooks?: readonly WebhookSpec[];
  apiKeys?: readonly ApiKeySpec[];
};

export type SolutionDefinition<Strings> = {
  id: SolutionId;
  strings: Record<SolutionDataLocale, Strings>;
  build: (strings: Strings, locale: SolutionDataLocale) => SolutionContent;
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
  build: (strings: never, locale: SolutionDataLocale) => SolutionContent;
};

export function solutionContent(definition: AnySolutionDefinition, locale: SolutionDataLocale): SolutionContent {
  const build = definition.build as (strings: unknown, locale: SolutionDataLocale) => SolutionContent;
  return build(definition.strings[locale], locale);
}

export { demoContactPhoto as photo, type DemoContactPhoto } from "../avatars";

/** Fictional phone numbers: templates whose trailing `#` run takes a zero-padded running number. */
export type PhonePlan = { templates: readonly string[]; start: number };

export function phoneNumber(plan: PhonePlan, index: number): string {
  const template = plan.templates[index % plan.templates.length];
  const digits = /#+$/.exec(template)?.[0].length ?? 0;
  return template.slice(0, template.length - digits) + String(plan.start + index).padStart(digits, "0");
}
