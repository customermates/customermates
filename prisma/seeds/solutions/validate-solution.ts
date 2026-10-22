import { SOLUTION_DATA_LOCALES, findSolution } from "@/core/solutions/solution-catalog";
import { wikiExcerpt } from "@/features/wiki/wiki-content";
import { WIKI_GUIDE_CONTEXT_MAX_BYTES, WikiPageInputSchema } from "@/features/wiki/wiki.schema";

import { solutionContent, type AnySolutionDefinition, type SolutionContent } from "./define-solution";
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
  };
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
      const count = data.records.length;
      if (count < SOLUTION_RECORD_BOUNDS.min || count > SOLUTION_RECORD_BOUNDS.max) {
        problems.push(
          `${locale}: ${count} records, expected ${SOLUTION_RECORD_BOUNDS.min}-${SOLUTION_RECORD_BOUNDS.max}`,
        );
      }
      for (const list of content.lists)
        if (!content.records[list.key]?.length) problems.push(`${locale}: list ${list.key} has no records`);
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
