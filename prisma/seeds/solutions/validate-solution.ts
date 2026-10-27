import { solutionFileValues } from "./solution-files";
import { SOLUTION_DATA_LOCALES, findSolution } from "@/core/solutions/solution-catalog";
import { ROUTINE_NAME_MAX_CHARS, ROUTINE_PROMPT_MAX_CHARS } from "@/ee/routines/routine.schema";
import {
  MIN_ROUTINE_INTERVAL_MINUTES,
  parseCronExpression,
  smallestIntervalMinutes,
} from "@/ee/routines/routine-schedule";
import { wikiExcerpt } from "@/features/wiki/wiki-content";
import { WIKI_GUIDE_CONTEXT_MAX_BYTES, WikiPageInputSchema } from "@/features/wiki/wiki.schema";

import { routinePrompt } from "../record-routine-prompts";
import {
  COLLEAGUE_KEYS,
  solutionContent,
  type AnySolutionDefinition,
  type MemberKey,
  type SolutionContent,
} from "./define-solution";
import { buildSolutionRecordData } from "./solution-data";
import { buildSolutionMessaging } from "./solution-messaging";
import { buildSolutionModel } from "./solution-model";
import { buildSolutionViews, buildSolutionWidgets, buildSolutionWiki } from "./solution-presentation";
import { findSolutionWorkspace } from "./solution-workspaces";

/** Labels that would claim a capability the product does not have (invoicing, reminders, forecasting, outreach). */
export const UNSUPPORTED_CLAIM_PATTERN =
  /\b(invoic|reminder|forecast|commission|sequence|campaign|enrich|chatbot|template|bulk|automat|rechnung|erinnerung|prognose|provision|sequenz|kampagne|anreicherung|vorlage|massen)/i;

const RESERVED_HOST = /(^|\.)example(\.(com|org|net))?$/;
const FICTIONAL_PHONE = /^\+(1 \d{3} 555 01\d\d|49 30 23125 \d{3}|44 20 7946 0\d{3})$/;

export const SOLUTION_RECORD_BOUNDS = { min: 30, max: 160 } as const;

function structure(content: SolutionContent) {
  return {
    lists: content.lists.map((list) => [list.key, list.icon]),
    fields: content.fields
      .filter((field) => !field.archived)
      .map((field) => [
        field.key,
        field.type,
        (field.options ?? []).map((option) => [option.key, option.color, option.probability]),
        field.formula ?? null,
        field.archived ?? false,
      ]),
    stages: content.stages.map((stage) => [stage.key, stage.color, stage.probability]),
    relationships: content.relationships ?? [],
    records: Object.entries(content.records).map(([list, records]) => [
      list,
      records.map((record) => ({
        key: record.key,
        links: record.links ?? {},
        lines: record.lines ?? [],
        owner: record.owner ?? null,
        createdDaysAgo: record.createdDaysAgo,
        history: (record.history ?? []).map((change) => [
          change.daysAgo,
          change.by ?? null,
          Object.keys(change.previous),
        ]),
        fields: Object.keys(record.values).sort(),
        channels: Object.keys(record.channels ?? {}).sort(),
        avatar: record.avatar ?? null,
      })),
    ]),
    views: content.views.map((view) => ({ ...view, name: null })),
    widgets: content.dashboard.widgets.map((widget) => ({ ...widget, title: null })),
    wiki: content.wiki.map((page) => [page.key, page.kind, page.markdown.length]),
    messaging: content.messaging
      ? {
          accounts: content.messaging.accounts,
          threads: content.messaging.threads.map((thread) => ({
            with: thread.with,
            links: thread.links ?? [],
            state: thread.state,
            latestMinutesAgo: thread.latestMinutesAgo,
            subject: thread.subject !== undefined,
            name: thread.name !== undefined,
            messages: thread.messages.map((message) => [
              message.from,
              message.draft ?? false,
              message.reaction?.from ?? null,
            ]),
          })),
          calendar: content.messaging.calendar?.events.map((event) => [event.with, event.startsMinutesAgo]) ?? null,
        }
      : null,
    dealValue: content.dealValue ?? null,
    members: (content.members ?? []).map((member) => [member.key, member.avatar]),
    routines: (content.routines ?? []).map((routine) => ({
      key: routine.key,
      owner: routine.owner ?? null,
      enabled: routine.enabled ?? true,
      trigger: routine.trigger,
      runs: routine.runs.map((run) => [run.status, run.startedHoursAgo, run.error ?? null, run.summary !== undefined]),
    })),
    webhooks: (content.webhooks ?? []).map((hook) => ({ ...hook, description: null, url: null })),
    apiKeys: (content.apiKeys ?? []).map((key) => key.createdDaysAgo),
    files: (content.files ?? []).map((file) => [
      file.key,
      file.record,
      file.field,
      file.kind,
      file.photo ?? null,
      file.uploadedDaysAgo,
    ]),
    planner: content.planner ?? null,
    trash: (content.trash ?? []).map((item) => [item.list, item.daysAgo]),
    mateChats: (content.mateChats ?? []).map((chat) => [chat.endedHoursAgo, chat.messages.map((m) => m.role)]),
  };
}

/** Problems of a workspace's routines, colleagues and record owners that only a seed run would otherwise find. */
function routineProblems(content: SolutionContent, team: boolean): string[] {
  const problems: string[] = [];
  const colleagues = new Set((content.members ?? []).map((member) => member.key));
  const known = (member: MemberKey | undefined) =>
    !member || !(COLLEAGUE_KEYS as readonly string[]).includes(member) || (!team && colleagues.has(member as never));
  for (const [list, records] of Object.entries(content.records)) {
    for (const record of records)
      if (!known(record.owner)) problems.push(`${list}:${record.key} is owned by an unknown colleague`);
  }
  const keys = new Set<string>();
  for (const routine of content.routines ?? []) {
    if (keys.has(routine.key)) problems.push(`routine ${routine.key} exists twice`);
    keys.add(routine.key);
    if (!known(routine.owner)) problems.push(`routine ${routine.key} is owned by an unknown colleague`);
    if (routine.name.length > ROUTINE_NAME_MAX_CHARS) problems.push(`routine ${routine.key} has a long name`);
    if (routinePrompt(routine.task).length > ROUTINE_PROMPT_MAX_CHARS)
      problems.push(`routine ${routine.key} has a long prompt`);
    if (routine.runs.length < 2 || routine.runs.length > 4) problems.push(`routine ${routine.key} needs 2-4 runs`);
    if (!routine.runs.some((run) => run.status === "succeeded" && run.summary))
      problems.push(`routine ${routine.key} needs a run with a summary`);
    for (const run of routine.runs) {
      if ((run.status === "succeeded") !== (run.summary !== undefined && run.error === undefined))
        problems.push(`routine ${routine.key}: a succeeded run has a summary, a failed or blocked run an error`);
    }
    const trigger = routine.trigger;
    if (trigger.kind === "schedule") {
      const parsed = parseCronExpression(trigger.cron);
      const smallest = parsed.ok
        ? smallestIntervalMinutes(parsed.cron, new Date("2026-01-01T00:00:00.000Z"), "Europe/Berlin")
        : null;
      if (smallest === null || smallest < MIN_ROUTINE_INTERVAL_MINUTES)
        problems.push(`routine ${routine.key} has an unsupported schedule`);
      continue;
    }
    const recordEvents = trigger.events.some((event) => event.startsWith("record."));
    if (recordEvents !== Boolean(trigger.lists?.length))
      problems.push(`routine ${routine.key} watches record events exactly when it names lists`);
    for (const list of trigger.lists ?? [])
      if (!content.lists.some((entry) => entry.key === list)) problems.push(`routine ${routine.key} watches ${list}`);
    const sample = trigger.sample;
    if (sample && "record" in sample) {
      const [list, key] = sample.record.split(":");
      const record = content.records[list]?.find((entry) => entry.key === key);
      if (!record || !recordEvents) problems.push(`routine ${routine.key} samples an unknown record`);
      else if (trigger.events[0] === "record.updated" && !record.history?.length)
        problems.push(`routine ${routine.key} samples a record that was never updated`);
    }
    if (sample && "thread" in sample && (recordEvents || !content.messaging?.threads[sample.thread]))
      problems.push(`routine ${routine.key} samples an unknown conversation`);
    if (!sample && routine.runs.length) problems.push(`routine ${routine.key} with runs needs a sample trigger`);
  }
  for (const hook of content.webhooks ?? []) {
    for (const list of hook.lists)
      if (!content.lists.some((entry) => entry.key === list)) problems.push(`webhook ${hook.key} watches ${list}`);
    if (!RESERVED_HOST.test(new URL(hook.url).hostname)) problems.push(`webhook ${hook.key} url is not reserved`);
  }
  for (const member of content.members ?? [])
    if (!RESERVED_HOST.test(member.email.split("@")[1] ?? "")) problems.push(`${member.key} email is not reserved`);
  return problems;
}

/**
 * Checks one solution definition without a database: both data locales build a valid model, records, views,
 * dashboard, wiki and conversations; EN and DE share their structure (only texts and the team workspace's extra
 * accounts may differ); labels claim no unsupported capability; addresses and phone numbers are reserved or
 * fictional. Returns the problems found.
 */
export function validateSolutionDefinition(
  definition: AnySolutionDefinition,
  options: { allowAccountDifference?: boolean } = {},
): string[] {
  const problems: string[] = [];
  const shapes: string[] = [];
  findSolution(definition.id);
  for (const locale of SOLUTION_DATA_LOCALES) {
    const workspace = findSolutionWorkspace(definition.id, locale);
    let content: SolutionContent;
    try {
      content = solutionContent(definition, locale);
      const model = buildSolutionModel(workspace.companyId, locale, content);
      const data = buildSolutionRecordData(workspace, content, model);
      buildSolutionViews(workspace, content, model);
      buildSolutionWidgets(workspace, content);
      buildSolutionWiki(workspace, content);
      buildSolutionMessaging(workspace, content, data);
      solutionFileValues(workspace, content, data);
      const count = data.records.length;
      if (count < SOLUTION_RECORD_BOUNDS.min || count > SOLUTION_RECORD_BOUNDS.max) {
        problems.push(
          `${locale}: ${count} records, expected ${SOLUTION_RECORD_BOUNDS.min}-${SOLUTION_RECORD_BOUNDS.max}`,
        );
      }
      for (const list of content.lists)
        if (!content.records[list.key]?.length) problems.push(`${locale}: list ${list.key} has no records`);
      problems.push(...routineProblems(content, workspace.team).map((problem) => `${locale}: ${problem}`));
    } catch (error) {
      problems.push(`${locale}: ${error instanceof Error ? error.message : String(error)}`);
      continue;
    }
    const shape = structure(content);
    if (options.allowAccountDifference && shape.messaging) shape.messaging.accounts = [];
    shapes.push(JSON.stringify(shape));

    const labels = [
      ...content.lists.flatMap((list) => [list.label, list.pluralLabel]),
      ...content.fields
        .filter((field) => !field.archived)
        .flatMap((field) => [field.label, ...(field.options ?? []).map((option) => option.label)]),
      ...content.stages.map((stage) => stage.label),
      ...(content.valueLabels ? [content.valueLabels.value, content.valueLabels.weighted] : []),
      ...content.views.map((view) => view.name),
      ...content.dashboard.widgets.map((widget) => widget.title),
    ];
    for (const label of labels) {
      if (UNSUPPORTED_CLAIM_PATTERN.test(label))
        problems.push(`${locale}: label "${label}" claims an unsupported capability`);
    }

    for (const [list, records] of Object.entries(content.records)) {
      for (const record of records) {
        const email = record.channels?.email;
        if (email && !RESERVED_HOST.test(email.split("@")[1] ?? ""))
          problems.push(`${locale}: ${list}:${record.key} email ${email} is not reserved`);
        for (const phone of [
          record.channels?.phone,
          ...Object.values(record.values).filter(
            (value): value is string => typeof value === "string" && /^\+\d/.test(value),
          ),
        ]) {
          if (phone && !FICTIONAL_PHONE.test(phone))
            problems.push(`${locale}: ${list}:${record.key} phone ${phone} is not fictional`);
        }
        for (const value of Object.values(record.values)) {
          if (typeof value === "string" && /^https?:\/\//.test(value) && !RESERVED_HOST.test(new URL(value).hostname))
            problems.push(`${locale}: ${list}:${record.key} url ${value} is not reserved`);
        }
      }
    }
    for (const page of content.wiki) {
      const markdown = page.markdown.join("\n");
      if (
        !WikiPageInputSchema.safeParse({ title: page.title, markdown, kind: page.kind, whenToUse: page.whenToUse })
          .success
      )
        problems.push(`${locale}: wiki page ${page.key} fails the editor validation`);
      if (!/^\S.+\n\n## /u.test(markdown))
        problems.push(`${locale}: wiki page ${page.key} must open with a paragraph, a blank line and a ## heading`);
      if (wikiExcerpt(markdown).length <= 70)
        problems.push(`${locale}: wiki page ${page.key} needs a longer opening paragraph`);
      if (page.kind === "procedure" && !/^(When|Wenn) .{40,}\.$/u.test(page.whenToUse ?? ""))
        problems.push(`${locale}: procedure ${page.key} needs whenToUse "When ... ." or "Wenn ... ." (40+ characters)`);
      if (page.kind !== "procedure" && page.whenToUse) problems.push(`${locale}: only procedures have whenToUse`);
      if (page.kind === "guide" && new TextEncoder().encode(markdown).byteLength > WIKI_GUIDE_CONTEXT_MAX_BYTES)
        problems.push(`${locale}: the guide exceeds ${WIKI_GUIDE_CONTEXT_MAX_BYTES} bytes`);
    }
    if (content.messaging && !RESERVED_HOST.test(new URL(content.messaging.website).hostname))
      problems.push(`${locale}: website ${content.messaging.website} is not reserved`);
  }
  if (shapes.length === 2 && shapes[0] !== shapes[1]) problems.push("EN and DE differ in structure");
  return problems;
}
