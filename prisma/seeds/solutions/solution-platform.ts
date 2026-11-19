import type {
  AutomationCondition,
  AutomationEffect,
  AutomationEffectOutcome,
  AutomationTrigger,
} from "@/features/automation-rules/automation-rule.schema";
import type { PublicFormConfig } from "@/features/public-form/public-form.schema";
import type { IncomingWebhookMapping } from "@/features/incoming-webhook/incoming-webhook.schema";
import type { WorkingHours } from "@/ee/calendar/working-hours";
import type { RecordModel } from "@/features/records/record-model.schema";
import type {
  AutomationRunStatus,
  AutomationTriggerKind,
  NotificationEmailMode,
  NotificationKind,
  Prisma,
  PrismaClient,
} from "@/generated/prisma";

import { dateOccurrenceKey, eventOccurrenceKey } from "@/features/automation-rules/automation-occurrence";
import { DEFAULT_WORKING_HOURS } from "@/ee/calendar/working-hours";
import { presetId } from "@/features/records/crm-preset";

import type { AgentJobResult, AgentTranscriptEvent } from "@/features/agent-jobs/agent-job.schema";
import type { AgentRunnerClient } from "@/features/agent-runners/agent-runner.schema";

import { AGENT_JOB_SOURCE_AUTOMATION } from "@/features/agent-jobs/agent-job.schema";
import { AGENT_JOB_DETAILED_ERROR, AGENT_JOB_ERROR_TEXT_KEY } from "@/features/agent-jobs/agent-job-dto";

import { demoBrandLogoPng } from "../brand-logo";
import { workspaceFixtureId } from "../helpers";
import { messagingUnipileAccountId } from "../messaging/seed";
import { TEAM_MEMBER_IDS } from "../team";
import { storyDay, storyMoment } from "../timeline";
import type { SolutionContent } from "./define-solution";
import { storyInstant, type SolutionRecordData } from "./solution-data";
import type { SolutionWorkspace } from "./solution-workspaces";

export const PLATFORM_ID_GROUPS = {
  rule: "7a000000",
  run: "7b000000",
  notification: "7c000000",
  bookingLink: "7d000000",
  booking: "7e000000",
  form: "7f000000",
  formSubmission: "7f100000",
  incomingWebhook: "7a100000",
  incomingDelivery: "7a200000",
  hostAccount: "7d100000",
  hostCalendar: "7d200000",
  runner: "7b100000",
  agentJob: "7b200000",
} as const;

export const DEMO_BRAND_ACCENT = "#0f766e";
export const DEMO_BRAND_LOGO_KEY = "harbor-lane-it-demo-logo";

const MINUTE = 60_000;

type RecordRef = { typeId: string; recordId: string };

export type PlatformRule = {
  id: string;
  name: string;
  enabled: boolean;
  trigger: AutomationTrigger;
  conditions: AutomationCondition[];
  effects: AutomationEffect[];
  createdAt: Date;
};

export type PlatformRun = {
  id: string;
  ruleId: string;
  occurrenceKey: string;
  status: Extract<AutomationRunStatus, "applied" | "skipped" | "failed">;
  triggerKind: AutomationTriggerKind;
  record: RecordRef | null;
  effects: AutomationEffectOutcome[];
  reason: string | null;
  error: string | null;
  scheduledFor: Date;
};

export type PlatformNotification = {
  id: string;
  userId: string;
  kind: NotificationKind;
  title: string;
  body: string | null;
  href: string | null;
  sourceRuleId: string;
  dedupeKey: string;
  createdAt: Date;
  readAt: Date | null;
};

export type PlatformBookingLink = {
  id: string;
  userId: string;
  token: string;
  title: string;
  description: string;
  durationMinutes: number;
  bufferMinutes: number;
  timeZone: string;
  workingHours: WorkingHours;
  withVideo: boolean;
  personTypeId: string;
  assignment: "single" | "roundRobin";
  successMessage: string;
  hostUserIds: string[];
  createdAt: Date;
};

export type PlatformBooking = {
  id: string;
  bookingLinkId: string;
  hostUserId: string;
  inviteeName: string;
  inviteeEmail: string;
  person: RecordRef;
  startsAt: Date;
  endsAt: Date;
  timeZone: string;
  manageToken: string;
  cancelledBy: "invitee" | null;
  cancelReason: string | null;
  cancelledAt: Date | null;
  rescheduledAt: Date | null;
  createdAt: Date;
};

export type PlatformFormSubmission = {
  id: string;
  outcome: "created" | "duplicate";
  record: RecordRef | null;
  person: RecordRef;
  answers: Array<{ fieldId: string | null; label: string; value: string }> | null;
  createdAt: Date;
};

export type PlatformIncomingDelivery = {
  id: string;
  outcome: "created" | "rejected_payload";
  statusCode: number;
  message: string | null;
  record: RecordRef | null;
  payload: Record<string, unknown>;
  createdAt: Date;
};

export type PlatformHostCalendar = {
  accountId: string;
  calendarId: string;
  userId: string;
  providerAccountId: string;
  providerCalendarId: string;
  displayName: string;
  name: string;
  timeZone: string;
  createdAt: Date;
};

export type PlatformRunner = {
  id: string;
  createdById: string;
  name: string;
  machine: string;
  tokenHash: string;
  clients: AgentRunnerClient[];
  lastSeenAt: Date;
  createdAt: Date;
};

export type PlatformAgentJob = {
  id: string;
  runId: string;
  idempotencyKey: string;
  ruleId: string;
  runnerId: string;
  ownerUserId: string;
  status: "succeeded" | "failed";
  prompt: string;
  result: AgentJobResult | { [AGENT_JOB_ERROR_TEXT_KEY]: string };
  transcript: AgentTranscriptEvent[];
  error: string | null;
  queuedAt: Date;
  startedAt: Date;
  finishedAt: Date;
};

export type PlatformFixtures = {
  brand: { accentColor: string; logo: Uint8Array; logoType: "image/png"; logoKey: string };
  hostCalendars: PlatformHostCalendar[];
  runner: PlatformRunner;
  agentJobs: PlatformAgentJob[];
  rules: PlatformRule[];
  runs: PlatformRun[];
  notifications: PlatformNotification[];
  preferences: Array<{ userId: string; kind: NotificationKind; emailMode: NotificationEmailMode }>;
  bookingLinks: PlatformBookingLink[];
  bookings: PlatformBooking[];
  form: {
    id: string;
    typeId: string;
    name: string;
    createdById: string;
    config: PublicFormConfig;
    createdAt: Date;
    submissions: PlatformFormSubmission[];
  };
  incomingWebhook: {
    id: string;
    typeId: string;
    name: string;
    createdById: string;
    mapping: IncomingWebhookMapping;
    samplePayload: Record<string, unknown>;
    createdAt: Date;
    deliveries: PlatformIncomingDelivery[];
  };
};

export function buildTeamPlatformFixtures(
  workspace: SolutionWorkspace,
  content: SolutionContent,
  model: RecordModel,
  data: SolutionRecordData,
): PlatformFixtures {
  const { companyId, tag } = workspace;
  const id = (key: string) => presetId(companyId, key);
  const fixture = (group: keyof typeof PLATFORM_ID_GROUPS, index: number) =>
    workspaceFixtureId(PLATFORM_ID_GROUPS[group], tag, index);
  const option = (fieldKey: string, key: string) => {
    const optionId = id(`${fieldKey}.${key}`);
    const field = model.fields.find((candidate) => candidate.id === id(fieldKey));
    if (!field?.options.some((candidate) => candidate.id === optionId))
      throw new Error(`${workspace.slug}: ${fieldKey} has no option ${key}`);
    return optionId;
  };
  const ref = (list: string, key: string): RecordRef => {
    const found = data.ids.get(`${list}:${key}`);
    if (!found) throw new Error(`${workspace.slug}: no ${list} ${key} for the platform fixtures`);
    return found;
  };
  const value = (record: RecordRef, fieldKey: string) => {
    const row = data.values.find(
      (entry) => entry.recordId === record.recordId && entry.typeId === record.typeId && entry.fieldId === id(fieldKey),
    );
    if (!row) throw new Error(`${workspace.slug}: ${record.recordId} has no ${fieldKey}`);
    return row.value;
  };
  const text = (record: RecordRef, fieldKey: string) => {
    const scalar = value(record, fieldKey);
    if (scalar.kind !== "text") throw new Error(`${workspace.slug}: ${fieldKey} is not text`);
    return scalar.value;
  };
  const dateOf = (record: RecordRef, fieldKey: string) => {
    const scalar = value(record, fieldKey);
    if (scalar.kind !== "date") throw new Error(`${workspace.slug}: ${fieldKey} is not a date`);
    return scalar.value;
  };
  const createdAt = (record: RecordRef) => {
    const row = data.records.find((entry) => entry.id === record.recordId && entry.typeId === record.typeId);
    if (!row) throw new Error(`${workspace.slug}: unknown record ${record.recordId}`);
    return row.createdAt;
  };
  const contact = (key: string) => {
    const spec = content.records.contact?.find((entry) => entry.key === key);
    const email = spec?.channels?.email;
    if (!spec || !email) throw new Error(`${workspace.slug}: contact ${key} has no email`);
    const record = ref("contact", key);
    return { record, name: `${text(record, "contact.firstName")} ${text(record, "contact.lastName")}`, email };
  };
  const recordHref = (record: RecordRef) => `/records/${record.typeId}/${record.recordId}`;
  const max = TEAM_MEMBER_IDS.maxBergmann;
  const minutesAfter = (moment: Date, minutes: number) => new Date(moment.getTime() + minutes * MINUTE);

  const accent = DEMO_BRAND_ACCENT;
  const brand = {
    accentColor: accent,
    logo: demoBrandLogoPng(accent),
    logoType: "image/png" as const,
    logoKey: DEMO_BRAND_LOGO_KEY,
  };

  const clara = TEAM_MEMBER_IDS.claraNeumann;
  const hostCalendars: PlatformHostCalendar[] = [
    {
      accountId: fixture("hostAccount", 1),
      calendarId: fixture("hostCalendar", 1),
      userId: clara,
      providerAccountId: `demo-fixture-${tag}-host-calendar-account`,
      providerCalendarId: `demo-fixture-${tag}-host-calendar`,
      displayName: "Clara Neumann · Google Calendar",
      name: "Customer visits",
      timeZone: content.timeZone,
      createdAt: storyMoment(32),
    },
  ];

  const runner: PlatformRunner = {
    id: fixture("runner", 1),
    createdById: max,
    name: "Office Mac mini",
    machine: "office-mini.harborlane-it.example",
    tokenHash: `demo-fixture-${tag}-runner-without-token`,
    clients: [{ name: "claude", version: "2.1.0" }],
    lastSeenAt: storyMoment(0, 95),
    createdAt: storyMoment(20),
  };

  const dealList = id("deal");
  const taskList = id("task");
  const contactList = id("contact");

  const form = {
    id: fixture("form", 1),
    typeId: dealList,
    name: "Website enquiry",
    createdById: TEAM_MEMBER_IDS.sofiaRossi,
    createdAt: storyMoment(40),
    config: {
      title: `Tell ${content.companyName} what you need`,
      description: "We reply within one working day with a first idea and a time for a call.",
      submitLabel: "Send enquiry",
      fields: [
        { fieldId: id("deal.name"), label: "Company or project", helpText: null, required: true },
        {
          fieldId: id("deal.notes"),
          label: "What can we help with?",
          helpText: "Number of desks, offices and anything that is not working today.",
          required: true,
        },
      ],
      person: {
        typeId: contactList,
        relationshipId: id("deal.contacts"),
        emailLabel: "Work email",
        nameLabel: "Your first name",
        nameFieldId: id("contact.firstName"),
      },
      consent: {
        text: `${content.companyName} may store my details to answer this enquiry.`,
        privacyUrl: "https://harborlane-it.example/privacy",
      },
      success: { message: "Thank you, we will be in touch within one working day.", redirectUrl: null },
      locale: "en",
    } satisfies PublicFormConfig,
    submissions: [] as PlatformFormSubmission[],
  };
  const enquiry = (index: number, dealKey: string, contactKey: string): PlatformFormSubmission => {
    const deal = ref("deal", dealKey);
    return {
      id: fixture("formSubmission", index),
      outcome: "created",
      record: deal,
      person: contact(contactKey).record,
      answers: null,
      createdAt: createdAt(deal),
    };
  };
  const oakridgeEnquiry = enquiry(1, "oakridgeSupport", "amelia");
  const willowEnquiry = enquiry(2, "willowSetup", "megan");
  const megan = contact("megan");
  form.submissions = [
    oakridgeEnquiry,
    willowEnquiry,
    {
      id: fixture("formSubmission", 3),
      outcome: "duplicate",
      record: null,
      person: megan.record,
      answers: [
        { fieldId: null, label: "Work email", value: megan.email },
        { fieldId: null, label: "Your first name", value: text(megan.record, "contact.firstName") },
        { fieldId: id("deal.name"), label: "Company or project", value: text(ref("deal", "willowSetup"), "deal.name") },
        {
          fieldId: id("deal.notes"),
          label: "What can we help with?",
          value: "Sending this again in case the first one got lost: we open the second shop next month.",
        },
      ],
      createdAt: minutesAfter(willowEnquiry.createdAt, 26 * 60),
    },
  ];

  const backupTask = ref("task", "checkBackupLogs");
  const backupAlert = (due: string) => ({
    alert: {
      title: text(backupTask, "task.name"),
      due,
      severity: "warning",
      site: "Riverside Physio",
      detail: "Two nightly backups of the reception PC did not finish.",
    },
  });
  const incomingWebhook = {
    id: fixture("incomingWebhook", 1),
    typeId: taskList,
    name: "Backup monitor alerts",
    createdById: max,
    createdAt: storyMoment(12),
    mapping: {
      mode: "create",
      matchFieldId: null,
      fields: [
        { path: "alert.title", fieldId: id("task.name") },
        { path: "alert.due", fieldId: id("task.dueDate") },
      ],
    } satisfies IncomingWebhookMapping,
    samplePayload: backupAlert(dateOf(backupTask, "task.dueDate")),
    deliveries: [
      {
        id: fixture("incomingDelivery", 1),
        outcome: "rejected_payload",
        statusCode: 422,
        message: "alert.due:invalid",
        record: null,
        payload: backupAlert("next Tuesday"),
        createdAt: storyMoment(11, 90),
      },
      {
        id: fixture("incomingDelivery", 2),
        outcome: "created",
        statusCode: 201,
        message: null,
        record: backupTask,
        payload: backupAlert(dateOf(backupTask, "task.dueDate")),
        createdAt: createdAt(backupTask),
      },
    ] satisfies PlatformIncomingDelivery[],
  };

  const singleLink: PlatformBookingLink = {
    id: fixture("bookingLink", 1),
    userId: max,
    token: `hl-intro-call-${tag}-demo`,
    title: `Intro call with ${content.companyName}`,
    description: "Thirty minutes to hear what your office needs and whether we are a good fit.",
    durationMinutes: 30,
    bufferMinutes: 10,
    timeZone: content.timeZone,
    workingHours: DEFAULT_WORKING_HOURS,
    withVideo: true,
    personTypeId: contactList,
    assignment: "single",
    successMessage: "Thanks, Max will call you at the chosen time.",
    hostUserIds: [],
    createdAt: storyMoment(45),
  };
  const roundRobinLink: PlatformBookingLink = {
    id: fixture("bookingLink", 2),
    userId: max,
    token: `hl-onsite-assessment-${tag}-demo`,
    title: "On-site IT assessment",
    description: "One of us walks through your office, network and backups and sends a written summary.",
    durationMinutes: 60,
    bufferMinutes: 30,
    timeZone: content.timeZone,
    workingHours: { ...DEFAULT_WORKING_HOURS, friday: [{ start: "09:00", end: "13:00" }] },
    withVideo: false,
    personTypeId: contactList,
    assignment: "roundRobin",
    successMessage: "Thanks, the host named in your confirmation will be there at the chosen time.",
    hostUserIds: [clara],
    createdAt: storyMoment(30),
  };
  const booking = (
    index: number,
    link: PlatformBookingLink,
    contactKey: string,
    host: string,
    day: number,
    time: string,
    bookedDaysAgo: number,
    change: Partial<Pick<PlatformBooking, "cancelledBy" | "cancelReason" | "cancelledAt" | "rescheduledAt">> = {},
  ): PlatformBooking => {
    const person = contact(contactKey);
    const startsAt = storyInstant(content, day, time);
    return {
      id: fixture("booking", index),
      bookingLinkId: link.id,
      hostUserId: host,
      inviteeName: person.name,
      inviteeEmail: person.email,
      person: person.record,
      startsAt,
      endsAt: minutesAfter(startsAt, link.durationMinutes),
      timeZone: content.timeZone,
      manageToken: `hl-manage-${tag}-${String(index).padStart(4, "0")}-demo`,
      cancelledBy: null,
      cancelReason: null,
      cancelledAt: null,
      rescheduledAt: null,
      createdAt: storyMoment(bookedDaysAgo, index * 37),
      ...change,
    };
  };
  const cancelledAt = storyMoment(3, 200);
  const bookings = [
    booking(1, roundRobinLink, "emma", clara, 9, "10:00", 2),
    booking(2, roundRobinLink, "amelia", max, 11, "14:00", 3),
    booking(3, roundRobinLink, "isla", clara, 10, "09:00", 12, {
      cancelledBy: "invitee",
      cancelReason: "We moved the office refit to next quarter, I will book again then.",
      cancelledAt,
    }),
    booking(4, roundRobinLink, "sophie", clara, -6, "10:00", 15),
    booking(5, singleLink, "chloe", max, 8, "16:00", 9, { rescheduledAt: storyMoment(2, 120) }),
    booking(6, singleLink, "megan", max, -17, "11:00", 18),
  ];

  const timezone = content.timeZone;
  const rule = (
    index: number,
    name: string,
    trigger: AutomationTrigger,
    effects: AutomationEffect[],
    createdDaysAgo: number,
    conditions: AutomationCondition[] = [],
  ): PlatformRule => ({
    id: fixture("rule", index),
    name,
    enabled: true,
    trigger,
    conditions,
    effects,
    createdAt: storyMoment(createdDaysAgo),
  });
  const notifyOwner = (title: string, kind: NotificationKind = "ruleAlert", body?: string): AutomationEffect => ({
    kind: "notify",
    recipients: { ruleOwner: true, assignees: false, userIds: [] },
    notificationKind: kind,
    title,
    ...(body ? { body } : {}),
  });

  const proposalFollowUp = rule(
    1,
    "Follow up three days after a proposal",
    {
      kind: "fieldChanged",
      typeId: dealList,
      fieldId: id("deal.stage"),
      to: { kind: "select", value: option("deal.stage", "proposal") },
      timezone,
    },
    [
      {
        kind: "createRecord",
        typeId: taskList,
        title: { fieldId: id("task.name"), text: "Follow up on the proposal: {{record.name}}" },
        due: { fieldId: id("task.dueDate"), offsetDays: 3 },
        fields: [
          { fieldId: id("task.status"), value: { kind: "select", value: option("task.status", "open") } },
          { fieldId: id("task.priority"), value: { kind: "select", value: option("task.priority", "high") } },
        ],
        assignToRuleOwner: false,
        assignedUserIds: [],
        link: { relationId: id("task.deals"), direction: "outgoing" },
      },
      notifyOwner("Proposal sent: {{record.name}}", "ruleAlert", "A follow-up task is due in three days."),
    ],
    60,
  );
  const closeDateReminder = rule(
    2,
    "Three weeks before a deal closes, remind its owner",
    {
      kind: "dateReached",
      typeId: dealList,
      fieldId: id("deal.closeDate"),
      days: 21,
      direction: "before",
      atHour: 6,
      timezone,
    },
    [
      {
        kind: "notify",
        recipients: { ruleOwner: true, assignees: true, userIds: [] },
        notificationKind: "dueToday",
        title: "{{record.name}} closes in three weeks",
        body: "Check the next step and the proposal before the close date.",
      },
    ],
    90,
    [
      {
        fieldId: id("deal.stage"),
        operator: "notIn",
        values: ["won", "lost"].map((key) => ({ kind: "select" as const, value: option("deal.stage", key) })),
      },
    ],
  );
  const replyNotice = rule(
    3,
    "Tell me when a customer replies",
    { kind: "messageReceived", channel: "any", timezone },
    [notifyOwner("New reply from {{record.name}}", "replyReceived")],
    50,
  );
  const enquiryNotice = rule(
    4,
    "Tell sales about new website enquiries",
    { kind: "formSubmitted", typeId: dealList, timezone },
    [
      {
        kind: "notify",
        recipients: { ruleOwner: true, assignees: false, userIds: [TEAM_MEMBER_IDS.sofiaRossi] },
        notificationKind: "ruleAlert",
        title: "New website enquiry: {{record.name}}",
        body: "Reply within one working day, as the form promises.",
      },
    ],
    40,
  );
  const bookingCancelled = rule(
    5,
    "Tell the hosts when an assessment is cancelled",
    { kind: "bookingChanged", change: "cancelled", sourceId: roundRobinLink.id, timezone },
    [
      {
        kind: "notify",
        recipients: { ruleOwner: true, assignees: false, userIds: [clara] },
        notificationKind: "ruleAlert",
        title: "An on-site assessment was cancelled",
        body: "The visitor cancelled through their booking link; the time is free again.",
      },
    ],
    30,
  );
  const blockedTask = rule(
    6,
    "Tell me when a task is blocked",
    {
      kind: "fieldChanged",
      typeId: taskList,
      fieldId: id("task.status"),
      to: { kind: "select", value: option("task.status", "blocked") },
      timezone,
    },
    [
      {
        kind: "notify",
        recipients: { ruleOwner: true, assignees: true, userIds: [] },
        notificationKind: "ruleAlert",
        title: "Task blocked: {{record.name}}",
      },
    ],
    45,
  );
  const dispatchWebhookId = workspaceFixtureId("22000000", tag, 2);
  const dispatch = rule(
    7,
    "Send new tasks to the dispatch board",
    { kind: "recordCreated", typeId: taskList, timezone },
    [{ kind: "callWebhook", webhookId: dispatchWebhookId }],
    4,
  );
  const backupAlerts = rule(
    8,
    "Give backup alerts to the service desk",
    { kind: "webhookReceived", typeId: taskList, sourceId: incomingWebhook.id, timezone },
    [
      {
        kind: "setField",
        fields: [{ fieldId: id("task.priority"), value: { kind: "select", value: option("task.priority", "medium") } }],
      },
      {
        kind: "notify",
        recipients: { ruleOwner: false, assignees: false, userIds: [TEAM_MEMBER_IDS.kianRahimi] },
        notificationKind: "ruleAlert",
        title: "Backup alert: {{record.name}}",
      },
    ],
    12,
  );
  const dealBrief = rule(
    9,
    "Ask the office agent for a brief when a deal's next step changes",
    { kind: "recordUpdated", typeId: dealList, fieldIds: [id("deal.nextStep"), id("deal.nextStepDate")], timezone },
    [
      {
        kind: "agent",
        runtime: "runner",
        runnerId: runner.id,
        prompt:
          "Read the deal {{record.name}}, its linked contacts, tasks and conversations. Add one dated note to the deal with the current state, what is still open and the next step. Change nothing else and send nothing.",
      },
    ],
    20,
  );
  const rules = [
    proposalFollowUp,
    closeDateReminder,
    replyNotice,
    enquiryNotice,
    bookingCancelled,
    blockedTask,
    dispatch,
    backupAlerts,
    dealBrief,
  ];

  const runs: PlatformRun[] = [];
  const notifications: PlatformNotification[] = [];
  const run = (
    target: PlatformRule,
    scheduledFor: Date,
    record: RecordRef | null,
    status: PlatformRun["status"],
    effects: AutomationEffectOutcome[],
    extra: { reason?: string; error?: string; occurrenceKey?: string } = {},
  ): PlatformRun => {
    const entry: PlatformRun = {
      id: fixture("run", runs.length + 1),
      ruleId: target.id,
      occurrenceKey: extra.occurrenceKey ?? eventOccurrenceKey(fixture("run", 900 + runs.length + 1)),
      status,
      triggerKind: target.trigger.kind,
      record,
      effects,
      reason: extra.reason ?? null,
      error: extra.error ?? null,
      scheduledFor,
    };
    runs.push(entry);
    return entry;
  };
  const notify = (
    source: PlatformRun,
    effectIndex: number,
    kind: NotificationKind,
    title: string,
    body: string | null,
    read: boolean,
  ) => {
    const at = minutesAfter(source.scheduledFor, 1);
    notifications.push({
      id: fixture("notification", notifications.length + 1),
      userId: max,
      kind,
      title,
      body,
      href: source.record ? recordHref(source.record) : null,
      sourceRuleId: source.ruleId,
      dedupeKey: `rule:${source.id}:${effectIndex}`,
      createdAt: at,
      readAt: read ? minutesAfter(at, 95) : null,
    });
  };
  const notified = (count: number): AutomationEffectOutcome => ({
    kind: "notify",
    status: "applied",
    detail: String(count),
  });
  const dealName = (key: string) => text(ref("deal", key), "deal.name");

  const kessler = ref("deal", "kesslerSupport");
  const proposalRun = run(proposalFollowUp, storyMoment(6, 30), kessler, "applied", [
    { kind: "createRecord", status: "applied" },
    notified(1),
  ]);
  notify(
    proposalRun,
    1,
    "ruleAlert",
    `Proposal sent: ${dealName("kesslerSupport")}`,
    "A follow-up task is due in three days.",
    true,
  );

  const closeRun = (
    dealKey: string,
    status: PlatformRun["status"],
    effects: AutomationEffectOutcome[],
    reason?: string,
  ) => {
    const deal = ref("deal", dealKey);
    const close = dateOf(deal, "deal.closeDate");
    const trigger = closeDateReminder.trigger as Extract<AutomationTrigger, { kind: "dateReached" }>;
    const fireDay = Math.round((Date.parse(close) - Date.parse(storyDay(0))) / 86_400_000) - trigger.days;
    return run(closeDateReminder, storyInstant(content, fireDay, "06:00"), deal, status, effects, {
      ...(reason ? { reason } : {}),
      occurrenceKey: dateOccurrenceKey(trigger, deal.recordId, close),
    });
  };
  const closeBody = "Check the next step and the proposal before the close date.";
  closeRun("cobaltSecurity", "skipped", [], "conditionsNotMet");
  const mapleClose = closeRun("mapleNetwork", "applied", [notified(2)]);
  notify(mapleClose, 0, "dueToday", `${dealName("mapleNetwork")} closes in three weeks`, closeBody, true);
  const kesslerClose = closeRun("kesslerSupport", "applied", [notified(2)]);
  notify(kesslerClose, 0, "dueToday", `${dealName("kesslerSupport")} closes in three weeks`, closeBody, false);

  const replyRun = (contactKey: string, daysAgo: number, read: boolean) => {
    const person = contact(contactKey);
    const entry = run(replyNotice, storyMoment(daysAgo, 140), person.record, "applied", [notified(1)]);
    notify(entry, 0, "replyReceived", `New reply from ${person.name}`, null, read);
  };
  replyRun("james", 2, true);
  replyRun("chloe", 1, false);

  for (const submission of [oakridgeEnquiry, willowEnquiry]) {
    if (!submission.record) continue;
    const entry = run(enquiryNotice, minutesAfter(submission.createdAt, 1), submission.record, "applied", [
      notified(2),
    ]);
    notify(
      entry,
      0,
      "ruleAlert",
      `New website enquiry: ${text(submission.record, "deal.name")}`,
      "Reply within one working day, as the form promises.",
      true,
    );
  }

  const cancelRun = run(bookingCancelled, minutesAfter(cancelledAt, 1), null, "applied", [notified(2)]);
  notify(
    cancelRun,
    0,
    "ruleAlert",
    "An on-site assessment was cancelled",
    "The visitor cancelled through their booking link; the time is free again.",
    false,
  );

  const invoiceTask = ref("task", "invoiceQuestion");
  const blockedRun = run(blockedTask, minutesAfter(createdAt(invoiceTask), 24 * 60), invoiceTask, "applied", [
    notified(2),
  ]);
  notify(blockedRun, 0, "ruleAlert", `Task blocked: ${text(invoiceTask, "task.name")}`, null, true);

  for (const taskKey of ["followUpWillow", "hotelWalkthrough"]) {
    const task = ref("task", taskKey);
    run(dispatch, minutesAfter(createdAt(task), 1), task, "applied", [
      { kind: "callWebhook", status: "skipped", detail: "webhook:disabled" },
    ]);
  }

  const agentJobs: PlatformAgentJob[] = [];
  const briefPrompt = (dealKey: string) =>
    `Read the deal ${dealName(dealKey)}, its linked contacts, tasks and conversations. Add one dated note to the deal with the current state, what is still open and the next step. Change nothing else and send nothing.`;
  const briefRun = (
    dealKey: string,
    daysAgo: number,
    minutesEarlier: number,
    summary: string | null,
    failure: string,
  ) => {
    const deal = ref("deal", dealKey);
    const jobId = fixture("agentJob", agentJobs.length + 1);
    const entry = run(dealBrief, storyMoment(daysAgo, minutesEarlier), deal, "applied", [
      { kind: "agent", status: "applied", detail: jobId, recordRef: deal },
    ]);
    const queuedAt = minutesAfter(entry.scheduledFor, 0);
    const startedAt = minutesAfter(queuedAt, 1);
    const finishedAt = minutesAfter(startedAt, summary ? 3 : 1);
    const at = (moment: Date) => moment.toISOString();
    const prompt = briefPrompt(dealKey);
    agentJobs.push({
      id: jobId,
      runId: entry.id,
      idempotencyKey: `rule:${entry.id}:0`,
      ruleId: dealBrief.id,
      runnerId: runner.id,
      ownerUserId: max,
      status: summary ? "succeeded" : "failed",
      prompt,
      result: summary ? { text: summary, reason: "stop", toolCalls: 2 } : { [AGENT_JOB_ERROR_TEXT_KEY]: failure },
      transcript: summary
        ? [
            { type: "message", role: "user", text: prompt, at: at(startedAt) },
            {
              type: "toolCall",
              toolCallId: "call-1",
              name: "read_crm_record",
              argumentsDigest: dealName(dealKey),
              at: at(minutesAfter(startedAt, 1)),
            },
            {
              type: "toolResult",
              toolCallId: "call-1",
              name: "read_crm_record",
              ok: true,
              summary: "Read the deal with its contacts, tasks and conversations.",
              at: at(minutesAfter(startedAt, 1)),
            },
            {
              type: "toolCall",
              toolCallId: "call-2",
              name: "mutate_crm_record",
              argumentsDigest: "Append one dated note",
              at: at(minutesAfter(startedAt, 2)),
            },
            {
              type: "toolResult",
              toolCallId: "call-2",
              name: "mutate_crm_record",
              ok: true,
              summary: "Added the note to the deal.",
              at: at(minutesAfter(startedAt, 2)),
            },
            { type: "finish", reason: "stop", text: summary, at: at(finishedAt) },
          ]
        : [
            { type: "message", role: "user", text: prompt, at: at(startedAt) },
            { type: "finish", reason: "error", text: failure, at: at(finishedAt) },
          ],
      error: summary ? null : AGENT_JOB_DETAILED_ERROR,
      queuedAt,
      startedAt,
      finishedAt,
    });
  };
  briefRun(
    "mapleNetwork",
    5,
    75,
    "Added a note: the revised quote with the second access point is out, James has not answered yet, and the next step is to agree an installation Friday with Grace.",
    "",
  );
  briefRun("oakridgeSupport", 3, 40, null, "The client stopped before it finished: the laptop lid was closed.");
  briefRun(
    "kesslerSupport",
    2,
    210,
    "Added a note: the renewal proposal is sent, the confirmed workstation count from David is still missing, and the next step is a short call this week.",
    "",
  );
  for (const [dealKey, daysAgo] of [
    ["cobaltSecurity", 1],
    ["willowSetup", 0],
  ] as const) {
    const refusal = "agentRuntimeUnavailable:noRunner";
    run(
      dealBrief,
      storyMoment(daysAgo, 300),
      ref("deal", dealKey),
      "failed",
      [{ kind: "agent", status: "failed", detail: refusal }],
      { error: refusal },
    );
  }

  run(backupAlerts, minutesAfter(createdAt(backupTask), 1), backupTask, "applied", [
    { kind: "setField", status: "applied", recordRef: backupTask },
    notified(1),
  ]);

  notifications.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  notifications.forEach((entry, index) => {
    entry.id = fixture("notification", index + 1);
  });

  return {
    brand,
    hostCalendars,
    runner,
    agentJobs,
    rules,
    runs,
    notifications,
    preferences: [
      { userId: max, kind: "dueToday", emailMode: "digest" },
      { userId: max, kind: "replyReceived", emailMode: "instant" },
      { userId: max, kind: "ruleAlert", emailMode: "digest" },
    ],
    bookingLinks: [singleLink, roundRobinLink],
    bookings,
    form,
    incomingWebhook,
  };
}

function json(value: unknown): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}

export async function seedSolutionPlatform(
  prisma: PrismaClient,
  workspace: SolutionWorkspace,
  fixtures: PlatformFixtures,
) {
  const { companyId, tag } = workspace;
  const scoped = (group: keyof typeof PLATFORM_ID_GROUPS, ids: string[]) => ({
    companyId,
    id: { startsWith: `${PLATFORM_ID_GROUPS[group]}-${tag}-`, notIn: ids },
  });

  const { brand } = fixtures;
  const brandRow = {
    accentColor: brand.accentColor,
    logo: new Uint8Array(brand.logo),
    logoType: brand.logoType,
    logoKey: brand.logoKey,
  };
  await prisma.companyBrand.upsert({ where: { companyId }, update: brandRow, create: { companyId, ...brandRow } });

  const calendarOf = new Map<string, string>();
  const ownerCalendar = await prisma.calendar.findFirst({
    where: { companyId, connectedAccount: { unipileAccountId: messagingUnipileAccountId(tag, "google") } },
    orderBy: { id: "asc" },
    select: { id: true },
  });
  if (ownerCalendar) calendarOf.set(workspace.memberId, ownerCalendar.id);
  for (const host of fixtures.hostCalendars) {
    const accountRow = {
      companyId,
      userId: host.userId,
      unipileAccountId: host.providerAccountId,
      provider: "google" as const,
      status: "ok" as const,
      hasMessaging: false,
      hasCalendar: true,
      displayName: host.displayName,
      shared: false,
      syncing: false,
      lastSyncedAt: host.createdAt,
      createdAt: host.createdAt,
      updatedAt: host.createdAt,
    } satisfies Prisma.ConnectedAccountUncheckedCreateInput;
    await prisma.connectedAccount.upsert({
      where: { id: host.accountId },
      update: accountRow,
      create: { id: host.accountId, ...accountRow },
    });
    const calendarRow = {
      companyId,
      connectedAccountId: host.accountId,
      unipileCalendarId: host.providerCalendarId,
      name: host.name,
      description: null,
      color: null,
      timezone: host.timeZone,
      createdAt: host.createdAt,
      updatedAt: host.createdAt,
    } satisfies Prisma.CalendarUncheckedCreateInput;
    await prisma.calendar.upsert({
      where: { id: host.calendarId },
      update: calendarRow,
      create: { id: host.calendarId, ...calendarRow },
    });
    calendarOf.set(host.userId, host.calendarId);
  }
  await prisma.calendar.deleteMany({
    where: scoped(
      "hostCalendar",
      fixtures.hostCalendars.map(({ calendarId }) => calendarId),
    ),
  });
  await prisma.connectedAccount.deleteMany({
    where: scoped(
      "hostAccount",
      fixtures.hostCalendars.map(({ accountId }) => accountId),
    ),
  });

  const { runner } = fixtures;
  const runnerRow = {
    companyId,
    name: runner.name,
    tokenHash: runner.tokenHash,
    machine: runner.machine,
    clients: json(runner.clients),
    lastSeenAt: runner.lastSeenAt,
    revokedAt: null,
    createdById: runner.createdById,
    createdAt: runner.createdAt,
    updatedAt: runner.lastSeenAt,
  } satisfies Prisma.AgentRunnerUncheckedCreateInput;
  await prisma.agentRunner.upsert({
    where: { id: runner.id },
    update: runnerRow,
    create: { id: runner.id, ...runnerRow },
  });
  await prisma.agentRunner.deleteMany({ where: scoped("runner", [runner.id]) });

  for (const rule of fixtures.rules) {
    const last = fixtures.runs.filter((entry) => entry.ruleId === rule.id).at(-1);
    const row = {
      companyId,
      ownerUserId: TEAM_MEMBER_IDS.maxBergmann,
      name: rule.name,
      enabled: rule.enabled,
      triggerKind: rule.trigger.kind,
      typeId: "typeId" in rule.trigger ? (rule.trigger.typeId ?? null) : null,
      trigger: json(rule.trigger),
      conditions: json(rule.conditions),
      effects: json(rule.effects),
      disabledReason: null,
      lastRunAt: last ? new Date(last.scheduledFor.getTime() + 2_000) : null,
      lastRunStatus: last?.status ?? null,
      createdAt: rule.createdAt,
      updatedAt: rule.createdAt,
    } satisfies Prisma.AutomationRuleUncheckedCreateInput;
    await prisma.automationRule.upsert({ where: { id: rule.id }, update: row, create: { id: rule.id, ...row } });
  }
  for (const entry of fixtures.runs) {
    const finishedAt = new Date(entry.scheduledFor.getTime() + 2_000);
    const row = {
      companyId,
      ruleId: entry.ruleId,
      occurrenceKey: entry.occurrenceKey,
      status: entry.status,
      triggerKind: entry.triggerKind,
      typeId: entry.record?.typeId ?? null,
      recordId: entry.record?.recordId ?? null,
      payload: json({}),
      outcome: json({ effects: entry.effects, ...(entry.reason ? { reason: entry.reason } : {}) }),
      error: entry.error,
      depth: 0,
      scheduledFor: entry.scheduledFor,
      startedAt: new Date(entry.scheduledFor.getTime() + 500),
      finishedAt,
      createdAt: entry.scheduledFor,
      updatedAt: finishedAt,
    } satisfies Prisma.AutomationRuleRunUncheckedCreateInput;
    await prisma.automationRuleRun.upsert({ where: { id: entry.id }, update: row, create: { id: entry.id, ...row } });
  }
  await prisma.automationRuleRun.deleteMany({
    where: scoped(
      "run",
      fixtures.runs.map(({ id }) => id),
    ),
  });
  await prisma.automationRule.deleteMany({
    where: scoped(
      "rule",
      fixtures.rules.map(({ id }) => id),
    ),
  });

  for (const job of fixtures.agentJobs) {
    const row = {
      companyId,
      runtime: "runner" as const,
      status: job.status,
      sourceKind: AGENT_JOB_SOURCE_AUTOMATION,
      sourceId: job.runId,
      idempotencyKey: job.idempotencyKey,
      ruleChain: [job.ruleId],
      ownerUserId: job.ownerUserId,
      prompt: job.prompt,
      promptUntrusted: true,
      model: null,
      pinnedRunnerId: job.runnerId,
      runnerId: job.runnerId,
      attempts: 1,
      startedAttempts: 1,
      queuedAt: job.queuedAt,
      claimedAt: job.startedAt,
      startedAt: job.startedAt,
      finishedAt: job.finishedAt,
      timeoutAt: null,
      result: json(job.result),
      transcript: json(job.transcript),
      error: job.error,
      createdAt: job.queuedAt,
      updatedAt: job.finishedAt,
    } satisfies Prisma.AgentJobUncheckedCreateInput;
    await prisma.agentJob.upsert({ where: { id: job.id }, update: row, create: { id: job.id, ...row } });
  }
  await prisma.agentJob.deleteMany({
    where: scoped(
      "agentJob",
      fixtures.agentJobs.map(({ id }) => id),
    ),
  });

  await prisma.notification.deleteMany({
    where: scoped(
      "notification",
      fixtures.notifications.map(({ id }) => id),
    ),
  });
  for (const entry of fixtures.notifications) {
    const row = {
      companyId,
      userId: entry.userId,
      kind: entry.kind,
      title: entry.title,
      body: entry.body,
      href: entry.href,
      sourceRuleId: entry.sourceRuleId,
      dedupeKey: entry.dedupeKey,
      readAt: entry.readAt,
      emailedAt: entry.createdAt,
      emailedInstantly: false,
      createdAt: entry.createdAt,
    } satisfies Prisma.NotificationUncheckedCreateInput;
    await prisma.notification.upsert({ where: { id: entry.id }, update: row, create: { id: entry.id, ...row } });
  }
  for (const preference of fixtures.preferences) {
    const key = { companyId, userId: preference.userId, kind: preference.kind };
    await prisma.notificationPreference.upsert({
      where: { companyId_userId_kind: key },
      update: { emailMode: preference.emailMode },
      create: { ...key, emailMode: preference.emailMode },
    });
  }

  for (const link of fixtures.bookingLinks) {
    const row = {
      companyId,
      userId: link.userId,
      calendarId: calendarOf.get(link.userId) ?? null,
      token: link.token,
      title: link.title,
      description: link.description,
      durationMinutes: link.durationMinutes,
      bufferMinutes: link.bufferMinutes,
      minNoticeMinutes: 240,
      horizonDays: 30,
      timeZone: link.timeZone,
      workingHours: json(link.workingHours),
      withVideo: link.withVideo,
      personTypeId: link.personTypeId,
      personRelationshipId: null,
      recordTypeId: null,
      startFieldId: null,
      questions: json([]),
      successMessage: link.successMessage,
      enabled: true,
      assignment: link.assignment,
      inviteeChanges: true,
      createdAt: link.createdAt,
      updatedAt: link.createdAt,
    } satisfies Prisma.BookingLinkUncheckedCreateInput;
    await prisma.bookingLink.upsert({ where: { id: link.id }, update: row, create: { id: link.id, ...row } });
    await prisma.bookingLinkHost.deleteMany({ where: { companyId, bookingLinkId: link.id } });
    if (link.hostUserIds.length) {
      await prisma.bookingLinkHost.createMany({
        data: link.hostUserIds.map((userId, position) => ({
          companyId,
          bookingLinkId: link.id,
          userId,
          calendarId: calendarOf.get(userId) ?? null,
          position,
          createdAt: link.createdAt,
        })),
      });
    }
  }
  for (const entry of fixtures.bookings) {
    const row = {
      companyId,
      bookingLinkId: entry.bookingLinkId,
      calendarEventId: null,
      slotKey: null,
      status: entry.cancelledBy ? ("cancelled" as const) : ("confirmed" as const),
      inviteeName: entry.inviteeName,
      inviteeEmail: entry.inviteeEmail,
      startsAt: entry.startsAt,
      endsAt: entry.endsAt,
      timeZone: entry.timeZone,
      answers: json({}),
      personTypeId: entry.person.typeId,
      personRecordId: entry.person.recordId,
      recordTypeId: null,
      recordId: null,
      ipHash: null,
      hostUserId: entry.hostUserId,
      manageToken: entry.manageToken,
      cancelledBy: entry.cancelledBy,
      cancelReason: entry.cancelReason,
      cancelledAt: entry.cancelledAt,
      rescheduledAt: entry.rescheduledAt,
      createdAt: entry.createdAt,
      updatedAt: entry.cancelledAt ?? entry.rescheduledAt ?? entry.createdAt,
    } satisfies Prisma.BookingUncheckedCreateInput;
    await prisma.booking.upsert({ where: { id: entry.id }, update: row, create: { id: entry.id, ...row } });
  }
  await prisma.booking.deleteMany({
    where: scoped(
      "booking",
      fixtures.bookings.map(({ id }) => id),
    ),
  });
  await prisma.bookingLink.deleteMany({
    where: scoped(
      "bookingLink",
      fixtures.bookingLinks.map(({ id }) => id),
    ),
  });

  const { form } = fixtures;
  const foreignForm = await prisma.publicForm.findFirst({
    where: { companyId, typeId: form.typeId, id: { not: form.id } },
    select: { id: true },
  });
  if (!foreignForm) {
    const last = form.submissions.at(-1)?.createdAt ?? null;
    const row = {
      companyId,
      typeId: form.typeId,
      name: form.name,
      createdById: form.createdById,
      enabled: true,
      config: json(form.config),
      consentVersion: 1,
      submissionCount: form.submissions.length,
      lastSubmittedAt: last,
      createdAt: form.createdAt,
      updatedAt: form.createdAt,
    } satisfies Prisma.PublicFormUncheckedCreateInput;
    await prisma.publicForm.upsert({ where: { id: form.id }, update: row, create: { id: form.id, ...row } });
    for (const submission of form.submissions) {
      const consent = form.config.consent;
      const submissionRow = {
        companyId,
        formId: form.id,
        outcome: submission.outcome,
        recordId: submission.record?.recordId ?? null,
        personRecordId: submission.person.recordId,
        ipHash: null,
        locale: form.config.locale,
        ...(submission.answers ? { answers: json(submission.answers) } : {}),
        consentText: consent?.text ?? null,
        consentVersion: consent ? 1 : null,
        consentedAt: consent ? submission.createdAt : null,
        createdAt: submission.createdAt,
      } satisfies Prisma.PublicFormSubmissionUncheckedCreateInput;
      await prisma.publicFormSubmission.upsert({
        where: { id: submission.id },
        update: submissionRow,
        create: { id: submission.id, ...submissionRow },
      });
    }
  }
  await prisma.publicFormSubmission.deleteMany({
    where: scoped("formSubmission", foreignForm ? [] : form.submissions.map(({ id }) => id)),
  });
  await prisma.publicForm.deleteMany({ where: scoped("form", foreignForm ? [] : [form.id]) });

  const hook = fixtures.incomingWebhook;
  const hookRow = {
    companyId,
    typeId: hook.typeId,
    name: hook.name,
    createdById: hook.createdById,
    enabled: true,
    tokenVersion: 1,
    signingSecret: null,
    signatureHeader: "x-signature",
    mapping: json(hook.mapping),
    samplePayload: json(hook.samplePayload),
    lastReceivedAt: hook.deliveries.at(-1)?.createdAt ?? null,
    createdAt: hook.createdAt,
    updatedAt: hook.createdAt,
  } satisfies Prisma.IncomingWebhookUncheckedCreateInput;
  await prisma.incomingWebhook.upsert({ where: { id: hook.id }, update: hookRow, create: { id: hook.id, ...hookRow } });
  for (const delivery of hook.deliveries) {
    const row = {
      companyId,
      webhookId: hook.id,
      outcome: delivery.outcome,
      statusCode: delivery.statusCode,
      message: delivery.message,
      recordId: delivery.record?.recordId ?? null,
      payloadBytes: Buffer.byteLength(JSON.stringify(delivery.payload)),
      payload: json(delivery.payload),
      createdAt: delivery.createdAt,
    } satisfies Prisma.IncomingWebhookDeliveryUncheckedCreateInput;
    await prisma.incomingWebhookDelivery.upsert({
      where: { id: delivery.id },
      update: row,
      create: { id: delivery.id, ...row },
    });
  }
  await prisma.incomingWebhookDelivery.deleteMany({
    where: scoped(
      "incomingDelivery",
      hook.deliveries.map(({ id }) => id),
    ),
  });
  await prisma.incomingWebhook.deleteMany({ where: scoped("incomingWebhook", [hook.id]) });
}
