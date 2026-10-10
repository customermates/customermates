import type { Filter } from "@/core/base/base-get.schema";

import { z } from "zod";

import { FilterOperatorKey } from "@/core/base/base-query-builder";
import { FilterSchema } from "@/core/base/base-get.schema";

export const COMMAND_RESOLVE_QUERY_LIMIT = 300;

export const ResolveCommandInputSchema = z
  .object({
    query: z.string().trim().min(3).max(COMMAND_RESOLVE_QUERY_LIMIT),
    locale: z.string().trim().min(2).max(16),
  })
  .strict();
export type ResolveCommandInput = z.infer<typeof ResolveCommandInputSchema>;

const RESOLVE_OPERATORS = [
  FilterOperatorKey.equals,
  FilterOperatorKey.notEquals,
  FilterOperatorKey.contains,
  FilterOperatorKey.gt,
  FilterOperatorKey.gte,
  FilterOperatorKey.lt,
  FilterOperatorKey.lte,
  FilterOperatorKey.in,
  FilterOperatorKey.notIn,
  FilterOperatorKey.between,
  FilterOperatorKey.hasAnyOf,
  FilterOperatorKey.hasNoneOf,
  FilterOperatorKey.isNull,
  FilterOperatorKey.isNotNull,
  FilterOperatorKey.inLastDays,
] as const;
const RESOLVE_OPERATOR_SET: ReadonlySet<string> = new Set(RESOLVE_OPERATORS);

const SINGLE_VALUE: ReadonlySet<string> = new Set([
  FilterOperatorKey.equals,
  FilterOperatorKey.notEquals,
  FilterOperatorKey.contains,
  FilterOperatorKey.gt,
  FilterOperatorKey.gte,
  FilterOperatorKey.lt,
  FilterOperatorKey.lte,
  FilterOperatorKey.inLastDays,
]);
const NO_VALUE: ReadonlySet<string> = new Set([FilterOperatorKey.isNull, FilterOperatorKey.isNotNull]);

export const CommandResolutionOutputSchema = z
  .object({
    kind: z.enum(["list", "command", "none"]),
    list: z.string().max(16).nullable(),
    view: z.string().max(16).nullable(),
    command: z.string().max(16).nullable(),
    filters: z
      .array(
        z
          .object({
            field: z.string().max(16),
            operator: z.enum(RESOLVE_OPERATORS),
            values: z.array(z.string().max(200)).max(20),
          })
          .strict(),
      )
      .max(10),
  })
  .strict();
export type CommandResolutionOutput = z.infer<typeof CommandResolutionOutputSchema>;

export const CommandResolutionSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("list"),
    typeId: z.uuid(),
    viewId: z.string().nullable(),
    filters: z.array(FilterSchema),
  }),
  z.object({ kind: z.literal("command"), key: z.string() }),
  z.object({ kind: z.literal("none") }),
]);
export type CommandResolution = z.infer<typeof CommandResolutionSchema>;

export type ResolvableField = {
  key: string;
  label: string;
  valueType: string;
  operators: readonly string[];
  options?: readonly { id: string; label: string }[];
};

export type ResolvableList = {
  typeId: string;
  label: string;
  pluralLabel: string;
  views: readonly { id: string; name: string }[];
  fields: readonly ResolvableField[];
};

export type ResolvableCommand = { key: string; label: string };

type FieldAlias = { typeId: string; field: ResolvableField; options: Map<string, string> };

export type CommandResolveAliases = {
  lists: Map<string, string>;
  views: Map<string, { typeId: string; viewId: string }>;
  fields: Map<string, FieldAlias>;
  commands: Map<string, string>;
};

const SYSTEM = [
  "You turn one search request typed into a CRM's command bar into a single navigation target.",
  "Answer with the JSON object only, using only the aliases listed in the catalog.",
  'Use kind "list" when the request asks to see records of one list, optionally narrowed by conditions.',
  "Then set list to the list alias, view to a view alias only when the request names that view, and add one filter per condition.",
  "A filter uses a field alias of that list and one of the operators listed for the field.",
  "Choice fields take option aliases as values. Numbers are plain decimals without currency or thousands separators (10k means 10000).",
  "Dates are YYYY-MM-DD; for periods such as this month use between with the first and last day; inLastDays takes a whole number of days.",
  'Use kind "command" with a command alias when the request asks to open a page, a setting or to run an action.',
  'Use kind "none" when nothing in the catalog fits; never guess and never invent aliases.',
  "The request can be in any language; catalog names can be in another language than the request.",
].join("\n");

function fieldLine(alias: string, field: ResolvableField, options: Map<string, string>): string {
  const choices = field.options?.length
    ? ` options: ${[...options].map(([optionAlias, id]) => `${optionAlias}=${field.options?.find((option) => option.id === id)?.label ?? ""}`).join(", ")}`
    : "";
  return `    ${alias} "${field.label}" (${field.valueType}) operators: ${field.operators.join(", ")}${choices}`;
}

export function commandResolveRequest(args: {
  query: string;
  today: string;
  lists: readonly ResolvableList[];
  commands: readonly ResolvableCommand[];
}): { system: string; prompt: string; aliases: CommandResolveAliases } {
  const aliases: CommandResolveAliases = { lists: new Map(), views: new Map(), fields: new Map(), commands: new Map() };
  const lines: string[] = [`Today: ${args.today}`, "Lists:"];
  args.lists.forEach((list, listIndex) => {
    const listAlias = `L${listIndex + 1}`;
    aliases.lists.set(listAlias, list.typeId);
    lines.push(`  ${listAlias} "${list.pluralLabel}" (one record: "${list.label}")`);
    for (const view of list.views) {
      const viewAlias = `V${aliases.views.size + 1}`;
      aliases.views.set(viewAlias, { typeId: list.typeId, viewId: view.id });
      lines.push(`    view ${viewAlias} "${view.name}"`);
    }
    for (const field of list.fields) {
      const operators = field.operators.filter((operator) => RESOLVE_OPERATOR_SET.has(operator));
      if (!operators.length) continue;
      const fieldAlias = `F${aliases.fields.size + 1}`;
      const options = new Map(
        (field.options ?? []).map((option, optionIndex) => [`${fieldAlias}O${optionIndex + 1}`, option.id]),
      );
      aliases.fields.set(fieldAlias, { typeId: list.typeId, field: { ...field, operators }, options });
      lines.push(fieldLine(fieldAlias, { ...field, operators }, options));
    }
  });
  lines.push("Commands:");
  args.commands.forEach((command, index) => {
    const alias = `C${index + 1}`;
    aliases.commands.set(alias, command.key);
    lines.push(`  ${alias} "${command.label}"`);
  });
  lines.push("", `Request: ${args.query}`);
  return { system: SYSTEM, prompt: lines.join("\n"), aliases };
}

function filterOf(alias: FieldAlias, operator: string, values: readonly string[]): Filter | null {
  const resolved = alias.options.size
    ? values.map((value) => alias.options.get(value) ?? "").filter(Boolean)
    : values.map((value) => value.trim()).filter(Boolean);
  if (alias.options.size && resolved.length !== values.length) return null;
  const candidate = NO_VALUE.has(operator)
    ? { field: alias.field.key, operator }
    : SINGLE_VALUE.has(operator)
      ? { field: alias.field.key, operator, value: resolved[0] }
      : { field: alias.field.key, operator, value: resolved };
  if (!NO_VALUE.has(operator) && resolved.length === 0) return null;
  const parsed = FilterSchema.safeParse(candidate);
  return parsed.success ? parsed.data : null;
}

export function parseCommandResolution(
  output: CommandResolutionOutput,
  aliases: CommandResolveAliases,
): CommandResolution | null {
  if (output.kind === "none") return null;
  if (output.kind === "command") {
    const key = output.command ? aliases.commands.get(output.command) : undefined;
    return key ? { kind: "command", key } : null;
  }
  const typeId = output.list ? aliases.lists.get(output.list) : undefined;
  if (!typeId) return null;
  const view = output.view ? aliases.views.get(output.view) : undefined;
  if (output.view && view?.typeId !== typeId) return null;
  const filters: Filter[] = [];
  for (const requested of output.filters) {
    const alias = aliases.fields.get(requested.field);
    if (alias?.typeId !== typeId || !alias.field.operators.includes(requested.operator)) return null;
    const filter = filterOf(alias, requested.operator, requested.values);
    if (!filter) return null;
    filters.push(filter);
  }
  return { kind: "list", typeId, viewId: view?.viewId ?? null, filters };
}
