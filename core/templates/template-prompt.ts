import type { Capability } from "@/core/capabilities/capabilities";
import type { TemplateDeployment } from "./template-registry";
import type { TemplateLocale, TemplateRule, TemplateSpec } from "./template-spec.schema";
import type { TemplatePromptText } from "./template-prompt-text";

import { SHIPPED_CAPABILITIES } from "@/core/capabilities/capabilities";

import { ruleEngineGap } from "./compile-template-automation";
import { needText } from "./compile-template-support";
import { fillPrompt, pluralPrompt, promptLocale, templatePromptText } from "./template-prompt-text";
import { resolveTemplateRule, templateCountry, templateRuleText } from "./template-rule-variants";

type PromptOptions = {
  deployment: TemplateDeployment;
  signupUrl: string;
  shipped?: ReadonlySet<Capability>;
  connected?: boolean;
  mcpUrl?: string;
  country?: string | null;
};

function bullet(text: string): string {
  return `- ${text}`;
}

function heading(copy: string, index?: number): string {
  return index === undefined ? `## ${copy}` : `## ${index}. ${copy}`;
}

export function templateSignupUrl(signupUrl: string, slug: string): string {
  const url = new URL(signupUrl);
  url.searchParams.set("template", slug);
  return url.toString();
}

function workspaceSection(spec: TemplateSpec, options: PromptOptions, copy: TemplatePromptText): string[] {
  if (options.connected && options.mcpUrl) {
    return [
      heading(copy.headings.yourWorkspace, 1),
      fillPrompt(copy.workspace.connectedAt, { mcpUrl: options.mcpUrl }),
    ];
  }
  if (options.connected) return [heading(copy.headings.thisWorkspace, 1), copy.workspace.connected];
  if (options.mcpUrl) {
    return [heading(copy.headings.yourWorkspace, 1), fillPrompt(copy.workspace.existsAt, { mcpUrl: options.mcpUrl })];
  }
  if (options.deployment === "cloud") {
    return [
      heading(copy.headings.getWorkspace, 1),
      fillPrompt(copy.workspace.cloud, { url: templateSignupUrl(options.signupUrl, spec.slug) }),
    ];
  }
  return [heading(copy.headings.getWorkspace, 1), copy.workspace.selfHosted];
}

function procedureSection(copy: TemplatePromptText): string[] {
  return [
    heading(copy.headings.beforeYouWrite, 2),
    bullet(copy.procedure.readContext),
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
    const all = [...stageFields, ...declared, ...calculated];
    return bullet(
      `${label.pluralLabel}${label.description ? ` (${label.description})` : ""}: ${all.join("; ") || copy.nameOnly}`,
    );
  });
  return [heading(copy.headings.listsAndFields, 3), ...lines];
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
  return [heading(copy.headings.views, 5), ...views, ...rule, heading(copy.headings.dashboardWidgets, 6), ...widgets];
}

function pageSection(spec: TemplateSpec, text: TemplateLocale, copy: TemplatePromptText): string[] {
  const pages = spec.knowledgePages.map((page) => {
    const label = needText(text.knowledgePages, page.key, "knowledgePages");
    return bullet(`${label.title}: ${label.sections.join("; ")}`);
  });
  return [heading(copy.headings.knowledgePages, 7), ...pages];
}

function availability(rule: TemplateRule, shipped: ReadonlySet<Capability>, copy: TemplatePromptText): string {
  if (rule.needs === "today") return copy.availability.routine;
  if (!shipped.has(rule.needs)) return copy.availability.unavailable;
  const gap = ruleEngineGap(rule);
  if (gap === "unavailable") return copy.availability.unavailable;
  return gap === "routine" ? copy.availability.routine : copy.availability.rule;
}

function dueText(rule: TemplateRule, copy: TemplatePromptText, locale: string): string {
  if (!rule.dueOffsetDays) return copy.due.sameDay;
  return fillPrompt(pluralPrompt(promptLocale(locale), copy.due.afterDays, rule.dueOffsetDays), {
    days: rule.dueOffsetDays,
  });
}

function ruleSection(
  spec: TemplateSpec,
  text: TemplateLocale,
  shipped: ReadonlySet<Capability>,
  copy: TemplatePromptText,
  country: string,
): string[] {
  if (!spec.followUpRules.length) return [];
  const lines = spec.followUpRules.map((declared) => {
    const rule = resolveTemplateRule(declared, country);
    const label = templateRuleText(needText(text.rules, declared.key, "rules"), declared, country);
    return bullet(
      `${label.title}${label.description ? `: ${label.description}` : ""}, ${dueText(rule, copy, text.locale)} [${availability(rule, shipped, copy)}]`,
    );
  });
  return [heading(copy.headings.followUpRoutines, 8), copy.routinesIntro, ...lines];
}

function questionSection(text: TemplateLocale, copy: TemplatePromptText): string[] {
  return [
    heading(copy.headings.questions, 9),
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
  const shipped = options.shipped ?? SHIPPED_CAPABILITIES;
  const copy = templatePromptText(text.locale);
  const sections = [
    [`# ${text.name}`, text.prompt.intro],
    workspaceSection(spec, options, copy),
    procedureSection(copy),
    listSection(spec, text, copy),
    relationshipSection(spec, text, copy),
    viewSection(spec, text, copy),
    pageSection(spec, text, copy),
    ruleSection(spec, text, shipped, copy, templateCountry(text.locale, options.country)),
    questionSection(text, copy),
    ruleOfTheRoad(copy),
  ];
  return `${sections
    .filter((section) => section.length)
    .map((section) => section.join("\n"))
    .join("\n\n")}\n`;
}
