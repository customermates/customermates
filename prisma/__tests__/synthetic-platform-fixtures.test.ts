import { describe, expect, it, vi } from "vitest";

import en from "@/i18n/locales/en.json";
import { automationModelIssues } from "@/features/automation-rules/automation-model-validation";
import {
  AUTOMATION_TRIGGER_KINDS,
  AutomationConditionSchema,
  AutomationEffectOutcomeSchema,
  AutomationEffectSchema,
  automationRuleFinalStateIssues,
  AutomationTriggerSchema,
} from "@/features/automation-rules/automation-rule.schema";
import { AgentJobResultSchema, AgentTranscriptEventSchema } from "@/features/agent-jobs/agent-job.schema";
import { AGENT_JOB_DETAILED_ERROR } from "@/features/agent-jobs/agent-job-dto";
import { AgentRunnerClientSchema } from "@/features/agent-runners/agent-runner.schema";
import { effectDetailText } from "@/app/[locale]/(protected)/w/[workspace]/automations/components/automation-run-texts";
import { PublicFormConfigSchema } from "@/features/public-form/public-form.schema";
import { formCannotSaveRecords } from "@/features/public-form/public-form-config-validation";
import {
  INCOMING_WEBHOOK_OUTCOMES,
  IncomingWebhookMappingSchema,
} from "@/features/incoming-webhook/incoming-webhook.schema";
import { WorkingHoursSchema } from "@/ee/calendar/working-hours";
import { NOTIFICATION_KINDS } from "@/features/notifications/notification.schema";
import { presetId } from "@/features/records/crm-preset";
import type { PrismaClient } from "@/generated/prisma";

import { SYNTHETIC_PAUSED_WEBHOOK_ID } from "../seeds/webhooks";
import { TEAM_MEMBER_IDS } from "../seeds/team";
import { solutionWorkspacePlans } from "../seeds/solutions/seed-solutions";
import { buildSolutionRecordData } from "../seeds/solutions/solution-data";
import {
  buildTeamPlatformFixtures,
  PLATFORM_ID_GROUPS,
  seedSolutionPlatform,
} from "../seeds/solutions/solution-platform";

const team = solutionWorkspacePlans().find(({ workspace }) => workspace.team);
if (!team) throw new Error("The demo has no team workspace");
const { workspace, content, model } = team;
const data = buildSolutionRecordData(workspace, content, model);
const fixtures = buildTeamPlatformFixtures(workspace, content, model, data);
const id = (key: string) => presetId(workspace.companyId, key);
const recordIds = new Set([...data.ids.values()].map(({ typeId, recordId }) => `${typeId}:${recordId}`));
const known = (ref: { typeId: string; recordId: string } | null) =>
  !ref || recordIds.has(`${ref.typeId}:${ref.recordId}`);
const messages = en as unknown as { AutomationRules: Record<string, Record<string, string>> };
const translate = ((key: string) => {
  let node: unknown = en;
  for (const part of key.split(".")) node = (node as Record<string, unknown> | undefined)?.[part];
  return typeof node === "string" ? node : key;
}) as unknown as Parameters<typeof effectDetailText>[0];

describe("platform fixtures of the team workspace", () => {
  it("are deterministic", () => {
    const sameData = buildSolutionRecordData(workspace, content, model);
    expect(buildTeamPlatformFixtures(workspace, content, model, sameData)).toEqual(fixtures);
  });

  it("seed valid automations over every trigger kind, one on a booking change and one with an agent step", () => {
    for (const rule of fixtures.rules) {
      const trigger = AutomationTriggerSchema.parse(rule.trigger);
      const conditions = rule.conditions.map((condition) => AutomationConditionSchema.parse(condition));
      const effects = rule.effects.map((effect) => AutomationEffectSchema.parse(effect));
      expect(automationModelIssues({ trigger, conditions, effects }, model), rule.name).toEqual([]);
      expect(automationRuleFinalStateIssues({ trigger, conditions, effects }), rule.name).toEqual([]);
    }
    expect(new Set(fixtures.rules.map(({ trigger }) => trigger.kind))).toEqual(new Set(AUTOMATION_TRIGGER_KINDS));
    const agentSteps = fixtures.rules.flatMap(({ effects }) =>
      effects.flatMap((effect) => (effect.kind === "agent" ? [effect] : [])),
    );
    expect(agentSteps).toEqual([expect.objectContaining({ runtime: "runner", runnerId: fixtures.runner.id })]);
    const effectKinds = new Set(fixtures.rules.flatMap(({ effects }) => effects.map(({ kind }) => kind)));
    for (const kind of ["notify", "setField", "createRecord", "callWebhook", "agent"])
      expect(effectKinds.has(kind as never), kind).toBe(true);
    const sources = fixtures.rules.flatMap(({ trigger }) =>
      "sourceId" in trigger && trigger.sourceId ? [trigger.sourceId] : [],
    );
    expect(sources).toEqual(expect.arrayContaining([fixtures.bookingLinks[1]?.id, fixtures.incomingWebhook.id]));
    const webhookTargets = fixtures.rules.flatMap(({ effects }) =>
      effects.flatMap((effect) => (effect.kind === "callWebhook" ? [effect.webhookId] : [])),
    );
    expect(webhookTargets).toEqual([SYNTHETIC_PAUSED_WEBHOOK_ID]);
  });

  it("keeps a run history of applied, skipped and failed runs with readable reasons", () => {
    const rules = new Map(fixtures.rules.map((rule) => [rule.id, rule]));
    const jobIds = new Set(fixtures.agentJobs.map(({ id: jobId }) => jobId));
    const readable = (detail: string) => jobIds.has(detail) || effectDetailText(translate, detail) !== detail;
    expect(fixtures.runs.filter(({ status }) => status === "applied").length).toBeGreaterThanOrEqual(3);
    expect(fixtures.runs.filter(({ status }) => status === "failed").length).toBeGreaterThanOrEqual(2);
    expect(new Set(fixtures.runs.map(({ status }) => status))).toEqual(new Set(["applied", "skipped", "failed"]));
    for (const run of fixtures.runs) {
      const rule = rules.get(run.ruleId);
      expect(rule, run.id).toBeDefined();
      expect(run.triggerKind).toBe(rule?.trigger.kind);
      expect(run.scheduledFor.getTime(), run.id).toBeGreaterThan(rule?.createdAt.getTime() ?? Infinity);
      expect(known(run.record), run.id).toBe(true);
      for (const effect of run.effects) {
        AutomationEffectOutcomeSchema.parse(effect);
        expect(known(effect.recordRef ?? null)).toBe(true);
      }
      if (run.reason) expect(messages.AutomationRules.reason?.[run.reason], run.reason).toBeTruthy();
      for (const effect of run.effects.filter((entry) => entry.detail && entry.kind !== "notify"))
        expect(readable(effect.detail ?? ""), effect.detail).toBe(true);
      if (run.status === "failed") expect(readable(run.error ?? ""), run.id).toBe(true);
      else expect(run.error).toBeNull();
    }
    expect(new Set(fixtures.runs.map((run) => `${run.ruleId}:${run.occurrenceKey}`)).size).toBe(fixtures.runs.length);
    const ruleIdsWithRuns = new Set(fixtures.runs.map((run) => run.ruleId));
    expect(fixtures.rules.filter((rule) => !ruleIdsWithRuns.has(rule.id))).toEqual([]);
  });

  it("leaves read and unread notifications of every kind in Max's bell, each from a seeded run", () => {
    const runIds = new Set(fixtures.runs.map(({ id: runId }) => runId));
    expect(fixtures.notifications.every((entry) => entry.userId === TEAM_MEMBER_IDS.maxBergmann)).toBe(true);
    for (const kind of NOTIFICATION_KINDS) {
      const unread = fixtures.notifications.filter((entry) => entry.kind === kind && entry.readAt === null);
      expect(unread.length, kind).toBeGreaterThan(0);
    }
    expect(fixtures.notifications.some((entry) => entry.readAt !== null)).toBe(true);
    for (const entry of fixtures.notifications) {
      const [, runId] = entry.dedupeKey.split(":");
      expect(runIds.has(runId ?? ""), entry.title).toBe(true);
      if (entry.href) {
        const [, , typeId, recordId] = entry.href.split("/");
        expect(recordIds.has(`${typeId}:${recordId}`), entry.href).toBe(true);
      }
      expect(entry.title.includes("{{"), entry.title).toBe(false);
    }
    expect(new Set(fixtures.notifications.map(({ dedupeKey }) => dedupeKey)).size).toBe(fixtures.notifications.length);
    expect(fixtures.preferences.map(({ kind }) => kind).sort()).toEqual([...NOTIFICATION_KINDS].sort());
  });

  it("shows a runner and finished agent jobs of the agent automation on the Agents tab", () => {
    const { runner } = fixtures;
    expect(runner.createdById).toBe(TEAM_MEMBER_IDS.maxBergmann);
    expect(runner.tokenHash).not.toMatch(/^[0-9a-f]{64}$/);
    expect(runner.machine).toMatch(/\.example$/);
    for (const client of runner.clients) AgentRunnerClientSchema.parse(client);
    const runs = new Map(fixtures.runs.map((run) => [run.id, run]));
    expect(new Set(fixtures.agentJobs.map(({ status }) => status))).toEqual(new Set(["succeeded", "failed"]));
    for (const job of fixtures.agentJobs) {
      const run = runs.get(job.runId);
      expect(run?.effects).toEqual([expect.objectContaining({ kind: "agent", status: "applied", detail: job.id })]);
      expect(job.runnerId).toBe(runner.id);
      expect(job.prompt.includes("{{"), job.id).toBe(false);
      expect(job.finishedAt.getTime()).toBeGreaterThan(job.startedAt.getTime());
      expect(job.transcript.length).toBeGreaterThan(0);
      for (const event of job.transcript) AgentTranscriptEventSchema.parse(event);
      if (job.status === "succeeded") AgentJobResultSchema.parse(job.result);
      else expect(job.error).toBe(AGENT_JOB_DETAILED_ERROR);
    }
    const jobKeys = new Set(fixtures.agentJobs.map(({ idempotencyKey }) => idempotencyKey));
    expect(jobKeys.size).toBe(fixtures.agentJobs.length);
  });

  it("offers a single host page and a round robin page with two hosts, each host with a seeded calendar", () => {
    const [single, roundRobin] = fixtures.bookingLinks;
    expect(single?.assignment).toBe("single");
    expect(roundRobin?.assignment).toBe("roundRobin");
    expect(new Set([roundRobin?.userId, ...(roundRobin?.hostUserIds ?? [])]).size).toBe(2);
    expect(fixtures.hostCalendars.map(({ userId }) => userId)).toEqual(roundRobin?.hostUserIds);
    expect(fixtures.bookingLinks.every((link) => link.userId === workspace.memberId)).toBe(true);
    for (const host of fixtures.hostCalendars) expect(host.providerAccountId).toMatch(/^demo-fixture-/);
    for (const link of fixtures.bookingLinks) {
      expect(WorkingHoursSchema.safeParse(link.workingHours).success).toBe(true);
      expect(link.token).toMatch(/^[A-Za-z0-9_-]{16,64}$/);
    }
  });

  it("books known contacts in the past and the future, with one visitor cancellation and one reschedule", () => {
    const now = Date.now();
    const links = new Map(fixtures.bookingLinks.map((link) => [link.id, link]));
    for (const booking of fixtures.bookings) {
      const link = links.get(booking.bookingLinkId);
      expect(link).toBeDefined();
      expect([link?.userId, ...(link?.hostUserIds ?? [])]).toContain(booking.hostUserId);
      expect(known(booking.person)).toBe(true);
      expect(booking.inviteeEmail).toMatch(/@.+\.example$/);
      expect(booking.endsAt.getTime() - booking.startsAt.getTime()).toBe((link?.durationMinutes ?? 0) * 60_000);
      expect(booking.manageToken).toMatch(/^[A-Za-z0-9_-]{16,64}$/);
      expect(booking.createdAt.getTime()).toBeGreaterThan(link?.createdAt.getTime() ?? Infinity);
    }
    const confirmed = fixtures.bookings.filter((booking) => !booking.cancelledBy);
    expect(confirmed.filter((booking) => booking.startsAt.getTime() > now).length).toBeGreaterThanOrEqual(3);
    expect(confirmed.filter((booking) => booking.endsAt.getTime() < now).length).toBeGreaterThanOrEqual(2);
    expect(fixtures.bookings.filter((booking) => booking.cancelledBy === "invitee")).toHaveLength(1);
    expect(confirmed.filter((booking) => booking.rescheduledAt)).toHaveLength(1);
    for (const link of fixtures.bookingLinks) {
      const own = confirmed.filter((booking) => booking.bookingLinkId === link.id);
      const upcoming = own.filter((booking) => booking.startsAt.getTime() > now).length;
      if (link.enabled) expect(upcoming, link.title).toBeGreaterThan(0);
      else expect(upcoming, link.title).toBe(0);
      expect(own.filter((booking) => booking.endsAt.getTime() < now).length, link.title).toBeGreaterThan(0);
    }
  });

  it("keeps a third, paused page so the panel shows an inactive page", () => {
    expect(fixtures.bookingLinks).toHaveLength(3);
    expect(fixtures.bookingLinks.filter((link) => !link.enabled).map((link) => link.title)).toEqual([
      "Support check-in",
    ]);
  });

  it("keeps a website enquiry form whose submissions are the website deals", () => {
    const config = PublicFormConfigSchema.parse(fixtures.form.config);
    expect(formCannotSaveRecords(config, model, fixtures.form.typeId)).toBe(false);
    const created = fixtures.form.submissions.filter((entry) => entry.outcome === "created");
    expect(created.length).toBeGreaterThanOrEqual(2);
    for (const submission of fixtures.form.submissions) {
      expect(known(submission.record)).toBe(true);
      expect(known(submission.person)).toBe(true);
      expect(submission.createdAt.getTime()).toBeGreaterThan(fixtures.form.createdAt.getTime());
    }
    for (const submission of created) {
      const source = data.values.find(
        (row) => row.recordId === submission.record?.recordId && row.fieldId === id("deal.source"),
      );
      expect(source?.value).toEqual({ kind: "select", value: id("deal.source.website") });
    }
    const duplicates = fixtures.form.submissions.filter((entry) => entry.outcome === "duplicate");
    expect(duplicates.some((entry) => entry.answers?.length)).toBe(true);
  });

  it("logs the deliveries of the backup monitor webhook", () => {
    IncomingWebhookMappingSchema.parse(fixtures.incomingWebhook.mapping);
    expect(fixtures.incomingWebhook.typeId).toBe(id("task"));
    const outcomes = fixtures.incomingWebhook.deliveries.map(({ outcome }) => outcome);
    for (const outcome of outcomes) expect(INCOMING_WEBHOOK_OUTCOMES).toContain(outcome);
    expect(outcomes).toEqual(expect.arrayContaining(["created", "rejected_payload"]));
    for (const delivery of fixtures.incomingWebhook.deliveries) expect(known(delivery.record)).toBe(true);
  });

  it("uses ids of its own fixture groups inside the team workspace", () => {
    const groups = Object.values(PLATFORM_ID_GROUPS);
    const ids = [
      ...fixtures.rules,
      ...fixtures.runs,
      ...fixtures.notifications,
      ...fixtures.bookingLinks,
      ...fixtures.bookings,
      fixtures.form,
      ...fixtures.form.submissions,
      fixtures.incomingWebhook,
      ...fixtures.incomingWebhook.deliveries,
      fixtures.runner,
      ...fixtures.agentJobs,
      ...fixtures.hostCalendars.flatMap((host) => [{ id: host.accountId }, { id: host.calendarId }]),
    ].map((entry) => entry.id);
    expect(new Set(ids).size).toBe(ids.length);
    const prefixes = groups.map((group) => `${group}-${workspace.tag}-`);
    expect(ids.filter((value) => !prefixes.some((prefix) => value.startsWith(prefix)))).toEqual([]);
  });
});

describe("seedSolutionPlatform", () => {
  const OWNER_CALENDAR_ID = "24000000-0000-4000-8000-000000000001";

  function fakePrisma(foreignForm: { id: string } | null) {
    const writes: Record<string, unknown[]> = {};
    const rows: Record<string, Map<string, unknown>> = {};
    const model = (name: string) => ({
      upsert: vi.fn((input: { where: unknown; create: unknown }) => {
        (writes[`${name}.upsert`] ??= []).push(input);
        (rows[name] ??= new Map()).set(JSON.stringify(input.where), input.create);
        return Promise.resolve({});
      }),
      deleteMany: vi.fn((input: { where?: { bookingLinkId?: string } }) => {
        (writes[`${name}.deleteMany`] ??= []).push(input);
        const linkId = input.where?.bookingLinkId;
        const stored = rows[name];
        if (linkId && stored) for (const key of [...stored.keys()]) if (key.includes(linkId)) stored.delete(key);
        return Promise.resolve({ count: 0 });
      }),
      createMany: vi.fn((input: { data: Array<{ bookingLinkId: string; userId: string }> }) => {
        (writes[`${name}.createMany`] ??= []).push(input);
        for (const row of input.data)
          (rows[name] ??= new Map()).set(JSON.stringify([row.bookingLinkId, row.userId]), row);
        return Promise.resolve({ count: input.data.length });
      }),
      findFirst: vi.fn(() => Promise.resolve(name === "calendar" ? { id: OWNER_CALENDAR_ID } : foreignForm)),
    });
    const names = [
      "connectedAccount",
      "calendar",
      "agentRunner",
      "agentJob",
      "automationRule",
      "automationRuleRun",
      "notification",
      "notificationPreference",
      "bookingLink",
      "bookingLinkHost",
      "booking",
      "publicForm",
      "publicFormSubmission",
      "incomingWebhook",
      "incomingWebhookDelivery",
    ];
    const prisma = Object.fromEntries(names.map((name) => [name, model(name)])) as unknown as PrismaClient;
    const counts = () => Object.fromEntries(names.map((name) => [name, rows[name]?.size ?? 0]));
    return { prisma, writes, counts };
  }

  it("holds each of the seven demo items after seeding and no more rows after seeding twice", async () => {
    const { prisma, counts } = fakePrisma(null);
    await seedSolutionPlatform(prisma, workspace, fixtures);
    const first = counts();
    expect(first).toEqual({
      connectedAccount: fixtures.hostCalendars.length,
      calendar: fixtures.hostCalendars.length,
      agentRunner: 1,
      agentJob: fixtures.agentJobs.length,
      automationRule: fixtures.rules.length,
      automationRuleRun: fixtures.runs.length,
      notification: fixtures.notifications.length,
      notificationPreference: fixtures.preferences.length,
      bookingLink: fixtures.bookingLinks.length,
      bookingLinkHost: 1,
      booking: fixtures.bookings.length,
      publicForm: 1,
      publicFormSubmission: fixtures.form.submissions.length,
      incomingWebhook: 1,
      incomingWebhookDelivery: fixtures.incomingWebhook.deliveries.length,
    });
    expect(Object.values(first).every((count) => count > 0)).toBe(true);
    expect(first.automationRule).toBeGreaterThanOrEqual(5);
    expect(first.notification).toBeGreaterThanOrEqual(5);
    expect(first.publicFormSubmission).toBeGreaterThanOrEqual(3);
    expect(first.incomingWebhookDelivery).toBeGreaterThanOrEqual(2);
    await seedSolutionPlatform(prisma, workspace, buildTeamPlatformFixtures(workspace, content, model, data));
    expect(counts()).toEqual(first);
  });

  it("writes every fixture inside the team workspace and removes only its own retired ids", async () => {
    const { prisma, writes } = fakePrisma(null);
    await seedSolutionPlatform(prisma, workspace, fixtures);
    expect(writes["automationRule.upsert"]).toHaveLength(fixtures.rules.length);
    expect(writes["automationRuleRun.upsert"]).toHaveLength(fixtures.runs.length);
    expect(writes["notification.upsert"]).toHaveLength(fixtures.notifications.length);
    expect(writes["booking.upsert"]).toHaveLength(fixtures.bookings.length);
    expect(writes["publicFormSubmission.upsert"]).toHaveLength(fixtures.form.submissions.length);
    expect(writes["incomingWebhookDelivery.upsert"]).toHaveLength(fixtures.incomingWebhook.deliveries.length);
    for (const [key, calls] of Object.entries(writes)) {
      for (const call of calls) {
        const input = call as {
          where?: { companyId?: string; id?: { startsWith?: string } };
          create?: { companyId?: string };
        };
        if (input.create) expect(input.create.companyId, key).toBe(workspace.companyId);
        if (key.endsWith(".deleteMany")) {
          expect(input.where?.companyId, key).toBe(workspace.companyId);
          if (input.where?.id?.startsWith) expect(input.where.id.startsWith).toContain(`-${workspace.tag}-`);
        }
      }
    }
    const runRows = writes["automationRuleRun.upsert"] as Array<{ create: { outcome: { effects: unknown[] } } }>;
    expect(runRows.every((row) => Array.isArray(row.create.outcome.effects))).toBe(true);
    const bookingLinks = writes["bookingLink.upsert"] as Array<{ create: { calendarId: string | null } }>;
    expect(bookingLinks.every((row) => row.create.calendarId === OWNER_CALENDAR_ID)).toBe(true);
    const hosts = writes["bookingLinkHost.createMany"] as Array<{ data: Array<{ calendarId: string | null }> }>;
    expect(hosts.flatMap(({ data: entries }) => entries.map((entry) => entry.calendarId))).toEqual(
      fixtures.hostCalendars.map(({ calendarId }) => calendarId),
    );
    const jobs = writes["agentJob.upsert"] as Array<{ create: { status: string; runtime: string } }>;
    expect(jobs.every((row) => row.create.runtime === "runner" && row.create.status !== "queued")).toBe(true);
  });

  it("leaves a form a member made for the deal list in place", async () => {
    const { prisma, writes } = fakePrisma({ id: "00000000-0000-4000-8000-000000000999" });
    await seedSolutionPlatform(prisma, workspace, fixtures);
    expect(writes["publicForm.upsert"]).toBeUndefined();
    expect(writes["publicFormSubmission.upsert"]).toBeUndefined();
  });
});
