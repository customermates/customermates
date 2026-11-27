import type { TemplateLocale, TemplateRule, TemplateSpec } from "./template-spec.schema";
import type { TemplatePromptText } from "./template-prompt-text";

import { setupAnchorFields } from "@/features/workspace-setup/setup-anchors";

import { ruleEngineGap } from "./compile-template-automation";
import { needText } from "./compile-template-support";
import { fillPrompt, pluralPrompt, promptLocale, templatePromptText } from "./template-prompt-text";
import { resolveTemplateRule, templateCountry, templateRuleText } from "./template-rule-variants";

type PromptOptions = {
  connected?: boolean;
  mcpUrl?: string;
  workspace?: string;
  country?: string | null;
  routineAllowance?: number | "unlimited" | null;
};

type RuleKind = keyof TemplatePromptText["availability"];

function bullet(text: string): string {
  return `- ${text}`;
}

function heading(copy: string, index?: number): string {
  return index === undefined ? `## ${copy}` : `## ${index}. ${copy}`;
}

function workspaceSection(options: PromptOptions, copy: TemplatePromptText): string[] {
  if (options.connected && options.mcpUrl && options.workspace) {
    return [
      heading(copy.headings.yourWorkspace, 1),
      fillPrompt(copy.workspace.connectedAt, { mcpUrl: options.mcpUrl, workspace: options.workspace }),
    ];
  }
  if (options.connected) return [heading(copy.headings.thisWorkspace, 1), copy.workspace.connected];
  if (options.mcpUrl && options.workspace) {
    const pending = fillPrompt(copy.workspace.existsAt, { mcpUrl: options.mcpUrl, workspace: options.workspace });
    return [heading(copy.headings.yourWorkspace, 1), pending];
  }
  return [heading(copy.headings.yourWorkspace, 1), copy.workspace.unconnected];
}

function procedureSection(copy: TemplatePromptText): string[] {
  return [
    heading(copy.headings.beforeYouWrite, 2),
    bullet(copy.procedure.readContext),
    bullet(copy.procedure.checkAccounts),
    bullet(copy.procedure.reuse),
    bullet(copy.procedure.describePlan),
    bullet(copy.procedure.askQuestions),
  ];
}

function fieldLine(
  spec: TemplateSpec,
  text: TemplateLocale,
  copy: TemplatePromptText,
  ref: string,
  type: keyof TemplatePromptText["fieldTypes"],
): string {
  const label = needText(text.fields, ref, "fields");
  const stage = spec.stages.find((candidate) => candidate.field === ref);
  const keys = stage
    ? stage.items.map((item) => item.key)
    : (spec.fields.find((field) => field.key === ref)?.options ?? []).map((option) => option.key);
  const choices = keys.length ? `: ${keys.map((key) => label.options[key] ?? key).join(", ")}` : "";
  return `${label.label} (${copy.fieldTypes[type]}${choices})`;
}

const ANCHOR_PROMPT_TYPES: Readonly<
  Record<keyof TemplatePromptText["anchorFields"], keyof TemplatePromptText["fieldTypes"]>
> = { channels: "channels", price: "currency", value: "currency" };

function anchorLines(list: TemplateSpec["lists"][number], copy: TemplatePromptText): string[] {
  return setupAnchorFields([list]).flatMap((ref) => {
    const name = ref.split(".")[1];
    if (name !== "channels" && name !== "price" && name !== "value") return [];
    return [`${copy.anchorFields[name]} (${copy.fieldTypes[ANCHOR_PROMPT_TYPES[name]]})`];
  });
}

function listSection(spec: TemplateSpec, text: TemplateLocale, copy: TemplatePromptText): string[] {
  const lines = spec.lists.map((list) => {
    const label = needText(text.lists, list.key, "lists");
    const stageFields = spec.stages
      .filter((stage) => stage.field.startsWith(`${list.key}.`))
      .map((stage) => fieldLine(spec, text, copy, stage.field, "select"));
    const declared = spec.fields
      .filter((field) => field.key.startsWith(`${list.key}.`))
      .map((field) => fieldLine(spec, text, copy, field.key, field.type));
    const calculated = spec.calculations
      .filter((calculation) => calculation.key.startsWith(`${list.key}.`))
      .map((calculation) => fieldLine(spec, text, copy, calculation.key, calculation.type));
    const all = [...anchorLines(list, copy), ...stageFields, ...declared, ...calculated];
    return bullet(
      `${label.pluralLabel}${label.description ? ` (${label.description})` : ""}: ${all.join("; ") || copy.nameOnly}`,
    );
  });
  return [heading(copy.headings.listsAndFields, 3), bullet(copy.contactDetails), ...lines];
}

function relationshipSection(spec: TemplateSpec, text: TemplateLocale, copy: TemplatePromptText): string[] {
  if (!spec.relationships.length) return [];
  const lines = spec.relationships.map((relation) => {
    const label = needText(text.relationships, relation.key, "relationships");
    const source = needText(text.lists, relation.source, "lists").pluralLabel;
    const target = needText(text.lists, relation.target, "lists").pluralLabel;
    return bullet(
      fillPrompt(copy.relationship, {
        source,
        target,
        sourceLabel: label.sourceLabel,
        targetLabel: label.targetLabel,
      }),
    );
  });
  return [heading(copy.headings.relationships, 4), ...lines];
}

function viewSection(spec: TemplateSpec, text: TemplateLocale, copy: TemplatePromptText): string[] {
  const views = spec.views.map((view) => {
    const grouping = view.groupBy
      ? `, ${fillPrompt(copy.groupedBy, { field: needText(text.fields, view.groupBy, "fields").label })}`
      : "";
    const marker = view.default ? `, ${copy.defaultView.marker}` : "";
    return bullet(`${needText(text.views, view.key, "views").name} (${copy.layouts[view.layout]}${grouping}${marker})`);
  });
  const rule = spec.views.some((view) => view.default) ? [bullet(copy.defaultView.rule)] : [];
  const widgets = spec.widgets.map((widget) => bullet(needText(text.widgets, widget.key, "widgets").title));
  return [
    heading(copy.headings.views, 5),
    bullet(copy.sharing.views),
    ...views,
    ...rule,
    heading(copy.headings.dashboardWidgets, 6),
    bullet(copy.sharing.widgets),
    ...widgets,
  ];
}

function recordDetailSection(copy: TemplatePromptText): string[] {
  return [heading(copy.headings.recordDetails, 7), bullet(copy.recordDetails.order), bullet(copy.recordDetails.pins)];
}

function pageSection(spec: TemplateSpec, text: TemplateLocale, copy: TemplatePromptText): string[] {
  const pages = spec.knowledgePages.map((page) => {
    const label = needText(text.knowledgePages, page.key, "knowledgePages");
    return bullet(`${label.title}: ${label.sections.join("; ")}`);
  });
  return [heading(copy.headings.knowledgePages, 8), ...pages];
}

function ruleKind(rule: TemplateRule): RuleKind {
  if (rule.needs === "today") return "routine";
  const gap = ruleEngineGap(rule);
  if (gap === "unavailable") return "unavailable";
  return gap === "routine" ? "routine" : "rule";
}

function dueText(rule: TemplateRule, copy: TemplatePromptText, locale: string): string {
  if (!rule.dueOffsetDays) return copy.due.sameDay;
  return fillPrompt(pluralPrompt(promptLocale(locale), copy.due.afterDays, rule.dueOffsetDays), {
    days: rule.dueOffsetDays,
  });
}

const UNRANKED = 1_000;

function ruleSection(
  spec: TemplateSpec,
  text: TemplateLocale,
  copy: TemplatePromptText,
  country: string,
  allowance: PromptOptions["routineAllowance"],
): string[] {
  if (!spec.followUpRules.length) return [];
  const entries = spec.followUpRules.map((declared) => {
    const rule = resolveTemplateRule(declared, country);
    const label = templateRuleText(needText(text.rules, declared.key, "rules"), declared, country);
    const sentence = `${label.title}${label.description ? `: ${label.description}` : ""}, ${dueText(rule, copy, text.locale)}`;
    return { kind: ruleKind(rule), priority: declared.priority ?? UNRANKED, sentence };
  });
  const routines = entries.filter((entry) => entry.kind === "routine");
  if (typeof allowance !== "number" || routines.length <= allowance) {
    const lines = entries.map((entry) => bullet(`${entry.sentence} [${copy.availability[entry.kind]}]`));
    return [heading(copy.headings.followUpRoutines, 9), copy.routinesIntro, ...lines];
  }
  const others = entries.filter((entry) => entry.kind !== "routine");
  const ranked = [...routines].sort((first, second) => first.priority - second.priority);
  const optional = `${copy.availability.routine}, ${copy.routineAllowance.optional}`;
  return [
    heading(copy.headings.followUpRoutines, 9),
    copy.routinesIntro,
    ...others.map((entry) => bullet(`${entry.sentence} [${copy.availability[entry.kind]}]`)),
    allowance === 0 ? copy.routineAllowance.none : fillPrompt(copy.routineAllowance.limited, { count: allowance }),
    ...ranked.map(
      (entry, position) =>
        `${position + 1}. ${entry.sentence} [${position < allowance ? copy.availability.routine : optional}]`,
    ),
  ];
}

function accountSection(copy: TemplatePromptText): string[] {
  return [
    heading(copy.headings.connectedAccounts, 10),
    bullet(copy.accounts.none),
    bullet(copy.accounts.read),
    bullet(copy.accounts.propose),
    bullet(copy.accounts.approve),
    bullet(copy.accounts.write),
  ];
}

function questionSection(text: TemplateLocale, copy: TemplatePromptText): string[] {
  return [
    heading(copy.headings.questions, 11),
    ...text.prompt.questions.map((question, index) => `${index + 1}. ${question}`),
  ];
}

function ruleOfTheRoad(copy: TemplatePromptText): string[] {
  return [
    heading(copy.headings.rules),
    bullet(copy.roadRules.noSamples),
    bullet(copy.roadRules.sendNothing),
    bullet(copy.roadRules.neverInvent),
    bullet(copy.roadRules.sensitiveData),
    bullet(copy.roadRules.readBack),
  ];
}

export function renderTemplatePrompt(spec: TemplateSpec, text: TemplateLocale, options: PromptOptions): string {
  const copy = templatePromptText(text.locale);
  const sections = [
    [`# ${text.name}`, text.prompt.intro],
    workspaceSection(options, copy),
    procedureSection(copy),
    listSection(spec, text, copy),
    relationshipSection(spec, text, copy),
    viewSection(spec, text, copy),
    recordDetailSection(copy),
    pageSection(spec, text, copy),
    ruleSection(spec, text, copy, templateCountry(text.locale, options.country), options.routineAllowance),
    accountSection(copy),
    questionSection(text, copy),
    ruleOfTheRoad(copy),
  ];
  return `${sections
    .filter((section) => section.length)
    .map((section) => section.join("\n"))
    .join("\n\n")}\n`;
}
