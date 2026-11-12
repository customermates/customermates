import type { Capability } from "@/core/capabilities/capabilities";
import type { TemplateDeployment } from "./template-registry";
import type { TemplateLocale, TemplateRule, TemplateSpec } from "./template-spec.schema";

import { SHIPPED_CAPABILITIES } from "@/core/capabilities/capabilities";

import { needText } from "./compile-template-support";

type PromptOptions = { deployment: TemplateDeployment; signupUrl: string; shipped?: ReadonlySet<Capability> };

const TYPE_WORDS: Readonly<Record<string, string>> = {
  text: "text",
  richText: "formatted text",
  number: "number",
  currency: "amount",
  boolean: "yes or no",
  date: "date",
  dateTime: "date and time",
  select: "choice",
  url: "link",
  member: "team member",
  address: "address",
  file: "file",
  dateRange: "date range",
  channels: "contact channels",
};

function bullet(text: string): string {
  return `- ${text}`;
}

export function templateSignupUrl(signupUrl: string, slug: string): string {
  const url = new URL(signupUrl);
  url.searchParams.set("template", slug);
  return url.toString();
}

function workspaceSection(spec: TemplateSpec, options: PromptOptions): string[] {
  if (options.deployment === "cloud") {
    return [
      "## 1. Get a workspace",
      `Create a Customermates workspace at ${templateSignupUrl(options.signupUrl, spec.slug)} and connect your assistant to it. The template is preselected there.`,
    ];
  }
  return [
    "## 1. Get a workspace",
    "Use your own Customermates instance. Connect your assistant to its MCP endpoint at <your instance address>/api/v1/mcp with an API key from Settings, API keys. Nothing here depends on the hosted cloud.",
  ];
}

function procedureSection(): string[] {
  return [
    "## 2. Before you write anything",
    bullet(
      "Call get_workspace_context and read the Operating Guide, the existing lists, fields, views and wiki pages.",
    ),
    bullet("Reuse what already exists. Never create a second list for something the workspace already tracks."),
    bullet(
      "Describe the plan below in plain words, adapted to my answers, and wait for my approval before you change anything.",
    ),
    bullet("Ask the questions at the end first. Leave every unknown empty instead of guessing."),
  ];
}

function fieldLine(spec: TemplateSpec, text: TemplateLocale, ref: string, type: string): string {
  const copy = needText(text.fields, ref, "fields");
  const stage = spec.stages.find((candidate) => candidate.field === ref);
  const keys = stage
    ? stage.items.map((item) => item.key)
    : (spec.fields.find((field) => field.key === ref)?.options ?? []).map((option) => option.key);
  const choices = keys.length ? `: ${keys.map((key) => copy.options[key] ?? key).join(", ")}` : "";
  return `${copy.label} (${TYPE_WORDS[type] ?? type}${choices})`;
}

function listSection(spec: TemplateSpec, text: TemplateLocale): string[] {
  const lines = spec.lists.map((list) => {
    const copy = needText(text.lists, list.key, "lists");
    const stageFields = spec.stages
      .filter((stage) => stage.field.startsWith(`${list.key}.`))
      .map((stage) => fieldLine(spec, text, stage.field, "select"));
    const declared = spec.fields
      .filter((field) => field.key.startsWith(`${list.key}.`))
      .map((field) => fieldLine(spec, text, field.key, field.type));
    const calculated = spec.calculations
      .filter((calculation) => calculation.key.startsWith(`${list.key}.`))
      .map((calculation) => fieldLine(spec, text, calculation.key, calculation.type));
    const all = [...stageFields, ...declared, ...calculated];
    return bullet(
      `${copy.pluralLabel}${copy.description ? ` (${copy.description})` : ""}: ${all.join("; ") || "name only"}`,
    );
  });
  return ["## 3. Lists and fields", ...lines];
}

function relationshipSection(spec: TemplateSpec, text: TemplateLocale): string[] {
  if (!spec.relationships.length) return [];
  const lines = spec.relationships.map((relation) => {
    const copy = needText(text.relationships, relation.key, "relationships");
    const source = needText(text.lists, relation.source, "lists").pluralLabel;
    const target = needText(text.lists, relation.target, "lists").pluralLabel;
    return bullet(
      `${source} link to ${target} (shown as ${copy.sourceLabel} on ${source} and ${copy.targetLabel} on ${target})`,
    );
  });
  return ["## 4. Relationships", ...lines];
}

function viewSection(spec: TemplateSpec, text: TemplateLocale): string[] {
  const views = spec.views.map((view) =>
    bullet(
      `${needText(text.views, view.key, "views").name} (${view.layout}${view.groupBy ? `, grouped by ${needText(text.fields, view.groupBy, "fields").label}` : ""})`,
    ),
  );
  const widgets = spec.widgets.map((widget) => bullet(needText(text.widgets, widget.key, "widgets").title));
  return ["## 5. Views", ...views, "## 6. Dashboard widgets", ...widgets];
}

function pageSection(spec: TemplateSpec, text: TemplateLocale): string[] {
  const pages = spec.knowledgePages.map((page) => {
    const copy = needText(text.knowledgePages, page.key, "knowledgePages");
    return bullet(`${copy.title}: ${copy.sections.join("; ")}`);
  });
  return ["## 7. Knowledge Base pages (outlines only, filled with my own facts)", ...pages];
}

function availability(rule: TemplateRule, shipped: ReadonlySet<Capability>): string {
  if (rule.needs === "today") return "an assistant routine that runs on a schedule";
  return shipped.has(rule.needs) ? "an automation rule" : "not available yet, do not set up";
}

function ruleSection(spec: TemplateSpec, text: TemplateLocale, shipped: ReadonlySet<Capability>): string[] {
  if (!spec.followUpRules.length) return [];
  const lines = spec.followUpRules.map((rule) => {
    const copy = needText(text.rules, rule.key, "rules");
    const due = rule.dueOffsetDays ? `, due after ${rule.dueOffsetDays} days` : ", due the same day";
    return bullet(
      `${copy.title}${copy.description ? `: ${copy.description}` : ""}${due} [${availability(rule, shipped)}]`,
    );
  });
  return [
    "## 8. Follow-up routines",
    "Propose these as a set. Set up only the ones marked as available and tell me about the rest.",
    ...lines,
  ];
}

function questionSection(text: TemplateLocale): string[] {
  return ["## 9. Questions for me", ...text.prompt.questions.map((question, index) => `${index + 1}. ${question}`)];
}

function ruleOfTheRoad(): string[] {
  return [
    "## Rules",
    bullet("Create no sample, demo or placeholder records."),
    bullet("Send nothing: no emails, messages, invitations or posts. Drafts only, and only when I ask."),
    bullet("Never invent prices, amounts, dates or names. Leave them empty until I tell you."),
    bullet("Keep sensitive personal data out of the workspace unless I ask for it."),
    bullet("After the build, read the result back and tell me what exists and what you skipped."),
  ];
}

export function renderTemplatePrompt(spec: TemplateSpec, text: TemplateLocale, options: PromptOptions): string {
  const shipped = options.shipped ?? SHIPPED_CAPABILITIES;
  const sections = [
    [`# ${text.name}`, text.prompt.intro],
    workspaceSection(spec, options),
    procedureSection(),
    listSection(spec, text),
    relationshipSection(spec, text),
    viewSection(spec, text),
    pageSection(spec, text),
    ruleSection(spec, text, shipped),
    questionSection(text),
    ruleOfTheRoad(),
  ];
  return `${sections
    .filter((section) => section.length)
    .map((section) => section.join("\n"))
    .join("\n\n")}\n`;
}
