import Ajv from "ajv";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";

import { REPO_ROOT } from "@/tests/conventions/walk";
import { createMockUser } from "@/tests/helpers/mock-user";
import {
  createMockDiModule,
  MOCK_ENV_MODULE,
  MOCK_PRISMA_DB_MODULE,
  MOCK_ZOD_MODULE,
} from "@/tests/helpers/interactor-test-setup";

const mockUser = createMockUser();

vi.mock("@/env", () => MOCK_ENV_MODULE);
vi.mock("@/core/di", () => createMockDiModule(() => mockUser));
vi.mock("@/core/validation/zod-error-map-server", () => MOCK_ZOD_MODULE);
vi.mock("@/prisma/db", () => MOCK_PRISMA_DB_MODULE);
vi.mock("@sentry/nextjs", () => ({ captureException: vi.fn(), setTag: vi.fn(), setUser: vi.fn() }));
vi.mock("next-intl/server", () => ({
  getTranslations: () => {
    const translator = Object.assign((key: string) => key, { raw: (key: string) => `localized:${key}` });
    return Promise.resolve(translator);
  },
  getLocale: () => Promise.resolve("en"),
}));

import { getAgentAiToolDefinitions, normalizeAgentAiToolInput } from "../agent-tools";
import {
  GOOGLE_SCHEMA_KEYS,
  GOOGLE_SCHEMA_TYPES,
  googleSafeJsonSchema,
  isGoogleServingProvider,
  providerWireInputSchema,
  summarizeGoogleSchemaChanges,
} from "../provider-safe-json-schema";

type JsonRecord = Record<string, unknown>;

const UUID = "3f7c1a54-9b2e-4c31-8f6a-2b5d7e9c1a04";
const NON_GOOGLE_PROVIDERS = ["azure", "anthropic", "baseten", "openai", "bedrock", "fireworks"];

const NO_GOOGLE_FIELD = [
  "$defs",
  "$id",
  "$ref",
  "$schema",
  "additionalProperties",
  "allOf",
  "const",
  "contains",
  "definitions",
  "dependentRequired",
  "example",
  "exclusiveMaximum",
  "exclusiveMinimum",
  "format",
  "if",
  "multipleOf",
  "not",
  "oneOf",
  "patternProperties",
  "prefixItems",
  "propertyNames",
  "propertyOrdering",
  "uniqueItems",
];

const ACCEPTED_TODAY: [string, unknown][] = [
  ["list_records", { entity: "contact", pageSize: 25 }],
  ["list_records", { entity: "contact", filters: [{ field: "name", operator: "contains", value: "a" }] }],
  ["list_records", { entity: "contact", filters: [{ field: "createdAt", operator: "inLastDays", value: 7 }] }],
  ["list_records", { entity: "contact", filters: [{ field: "owner", operator: "isNull" }] }],
  ["list_records", { entity: "contact", filters: [{ field: "tags", operator: "in", value: ["a"] }] }],
  ["get_activities", {}],
  ["get_activities", { pageSize: 5 }],
  ["create_contacts", { contacts: [{ firstName: "Ada", lastName: "L", notes: "# hi" }] }],
  ["create_contacts", { contacts: [{ firstName: "Ada", lastName: "L", notes: null }] }],
  ["create_contacts", { contacts: [{ firstName: "Ada", lastName: "L", notes: 42 }] }],
  ["update_contacts", { contacts: [{ id: UUID, customFieldValues: null }] }],
  ["update_contacts", { contacts: [{ id: UUID, customFieldValues: [{ columnId: UUID, value: null }] }] }],
  ["update_deals", { deals: [{ id: UUID, services: null }] }],
  [
    "manage_custom_columns",
    { action: "upsert", id: null, intent: "create", label: "L", type: "plain", entityType: "contact" },
  ],
  ["manage_custom_columns", { action: "upsert", id: UUID, options: null }],
  ["manage_webhooks", { action: "update", secret: null }],
  ["manage_webhooks", { action: "list", pageSize: 100 }],
  ["update_workspace_settings", { target: "profile", avatarUrl: null }],
  ["update_workspace_settings", { target: "profile", avatarUrl: "" }],
  ["update_workspace_settings", { target: "profile", avatarUrl: "https://example.com/a.png" }],
  ["open_record", { entity: "contact", recordId: "new" }],
  ["open_record", { entity: "contact", recordId: UUID, presentation: "drawer" }],
  ["linkedin_search_sales_leads", { connectedAccountId: UUID, filters: { network_distance: [1, 2, "GROUP"] } }],
  [
    "linkedin_search_sales_leads",
    { connectedAccountId: UUID, filters: { company_headcount: [{ min: 51, max: 200 }] } },
  ],
  [
    "linkedin_search_sales_companies",
    { connectedAccountId: UUID, filters: { annual_revenue: { min: 0.5, max: 2.5, currency: "USD" } } },
  ],
  ["create_services", { services: [{ name: "S", amount: 10 }] }],
  ["get_social_posts", { connectedAccountId: UUID, authorIdentifier: "x", limit: 5, offset: 1 }],
  ["get_workspace_context", {}],
  ["search_records", { searchTerm: "a" }],
  ["manage_widgets", { action: "list" }],
  ["send_email", { connectedAccountId: UUID, subject: "s", body: "b", to: [{ identifier: "ada@example.com" }] }],
];

const REJECTED_TODAY: [string, unknown][] = [
  ["list_records", {}],
  ["list_records", { entity: "spaceship" }],
  ["open_record", { entity: "contact" }],
  ["create_contacts", { contacts: [] }],
  ["manage_webhooks", { action: "detonate" }],
  ["update_contacts", { contacts: [{ id: UUID, customFieldValues: [{ columnId: UUID, value: 5 }] }] }],
  ["send_email", { connectedAccountId: "nope", subject: "s", body: "b", to: [{ identifier: "a@b.com" }] }],
];

const declaredTools = getAgentAiToolDefinitions();
const googleTools = getAgentAiToolDefinitions("vertex");

function schemaOf(definitions: typeof declaredTools, name: string) {
  const found = definitions.find((definition) => definition.name === name);
  if (!found) throw new Error(`No shipped tool named "${name}".`);

  return found.inputSchema;
}

function walkNodes(node: unknown, pointer: string, visit: (schema: JsonRecord, pointer: string) => void) {
  if (typeof node !== "object" || node === null || Array.isArray(node)) return;

  const schema = node as JsonRecord;
  visit(schema, pointer);
  if (typeof schema.properties === "object" && schema.properties !== null) {
    for (const [key, value] of Object.entries(schema.properties as JsonRecord))
      walkNodes(value, `${pointer}/properties/${key}`, visit);
  }
  if (schema.items !== undefined) walkNodes(schema.items, `${pointer}/items`, visit);
  for (const key of ["anyOf", "oneOf", "allOf"]) {
    if (Array.isArray(schema[key]))
      (schema[key] as unknown[]).forEach((member, index) => walkNodes(member, `${pointer}/${key}/${index}`, visit));
  }
}

function googleNodes() {
  const found: { label: string; node: JsonRecord }[] = [];
  for (const { name, inputSchema } of googleTools)
    walkNodes(inputSchema, "#", (node, pointer) => found.push({ label: `${name} ${pointer}`, node }));

  return found;
}

function changesForShippedCatalog() {
  return declaredTools.flatMap(({ inputSchema }) => googleSafeJsonSchema(inputSchema).changes);
}

describe("the Google function-declaration dialect", () => {
  it("drops the draft-07 preamble and every keyword Google has no field for", () => {
    const result = googleSafeJsonSchema({
      $schema: "http://json-schema.org/draft-07/schema#",
      type: "object",
      properties: {
        a: { type: "array", items: { type: "string", format: "uuid", uniqueItems: true } },
        b: { type: "object", propertyNames: { pattern: "^x" }, patternProperties: { "^y": { type: "string" } } },
      },
      additionalProperties: false,
    });

    expect(result.schema).toEqual({
      type: "object",
      properties: { a: { type: "array", items: { type: "string" } }, b: { type: "object" } },
    });
  });

  it("folds oneOf into anyOf, merging with an anyOf that is already there", () => {
    expect(googleSafeJsonSchema({ oneOf: [{ type: "string" }, { type: "number" }] }).schema).toEqual({
      anyOf: [{ type: "string" }, { type: "number" }],
    });
    expect(
      googleSafeJsonSchema({ anyOf: [{ type: "boolean" }], oneOf: [{ type: "string" }, { type: "number" }] }).schema,
    ).toEqual({ anyOf: [{ type: "boolean" }, { type: "string" }, { type: "number" }] });
  });

  it("re-expresses a string const as the single-value enum Google understands", () => {
    expect(googleSafeJsonSchema({ type: "string", title: "Mode", const: "new" }).schema).toEqual({
      type: "string",
      title: "Mode",
      enum: ["new"],
    });
  });

  it("keeps the numeric type and names the values when it drops a non-string enum", () => {
    expect(googleSafeJsonSchema({ description: "Radius", type: "number", enum: [1, 5, 10] }).schema).toEqual({
      type: "number",
      description: "Radius Allowed values: 1, 5, 10.",
      minimum: 1,
      maximum: 10,
    });
  });

  it("leaves a description that already names every dropped value alone", () => {
    const description = "Results per page (one of: 5, 10, 25, 100). Default 10.";

    expect(googleSafeJsonSchema({ description, type: "number", enum: [5, 10, 25, 100] }).schema).toEqual({
      type: "number",
      description,
      minimum: 5,
      maximum: 100,
    });
  });

  it("splits a typeless mixed enum into one typed branch per JSON type", () => {
    expect(googleSafeJsonSchema({ enum: [1, 2, 3, "GROUP"] }).schema).toEqual({
      description: 'Allowed values: 1, 2, 3, "GROUP".',
      anyOf: [
        { type: "string", enum: ["GROUP"] },
        { type: "integer", minimum: 1, maximum: 3 },
      ],
    });
  });

  it("turns exclusive bounds into the inclusive bounds Google has fields for", () => {
    expect(googleSafeJsonSchema({ type: "integer", exclusiveMinimum: 0, maximum: 9 }).schema).toEqual({
      type: "integer",
      minimum: 1,
      maximum: 9,
    });
    expect(googleSafeJsonSchema({ type: "number", exclusiveMinimum: 0 }).schema).toEqual({
      type: "number",
      minimum: 0,
    });
    expect(googleSafeJsonSchema({ type: "integer", minimum: 4, exclusiveMinimum: 0 }).schema).toEqual({
      type: "integer",
      minimum: 4,
    });
    expect(googleSafeJsonSchema({ type: "integer", exclusiveMaximum: 10 }).schema).toEqual({
      type: "integer",
      maximum: 9,
    });
  });

  it("collapses a nullable union onto the branch that survives", () => {
    expect(
      googleSafeJsonSchema({
        description: "Services",
        anyOf: [{ type: "array", items: { type: "string" }, minItems: 1 }, { type: "null" }],
      }).schema,
    ).toEqual({
      type: "array",
      nullable: true,
      description: "Services",
      items: { type: "string" },
      minItems: 1,
    });
    expect(googleSafeJsonSchema({ type: ["string", "null"], minLength: 1 }).schema).toEqual({
      type: "string",
      nullable: true,
      minLength: 1,
    });
  });

  it("puts nullable on a branch that can carry it, never on a bare union", () => {
    const result = googleSafeJsonSchema({
      anyOf: [
        {
          anyOf: [
            { type: "string", pattern: "^x" },
            { type: "string", const: "" },
          ],
        },
        { type: "null" },
      ],
    });

    expect(result.schema).toEqual({
      anyOf: [
        { type: "string", nullable: true, pattern: "^x" },
        { type: "string", enum: [""] },
      ],
    });
    expect(new Ajv().compile(result.schema as never)(null)).toBe(true);
  });

  it("drops an enum that would stop nullable admitting null", () => {
    const single = googleSafeJsonSchema({ anyOf: [{ type: "string", enum: ["a", "b"] }, { type: "null" }] });

    expect(single.schema).toEqual({ type: "string", nullable: true, description: 'Allowed values: "a", "b".' });
    expect(new Ajv().compile(single.schema as never)(null)).toBe(true);
    expect(new Ajv().compile({ type: "string", enum: ["a"], nullable: true })(null)).toBe(false);
  });

  it("leaves a union that already admits null unconstrained rather than nullable", () => {
    const result = googleSafeJsonSchema({ description: "Markdown content", anyOf: [{}, { type: "null" }] });

    expect(result.schema).toEqual({ description: "Markdown content" });
    expect(new Ajv().compile(result.schema as never)(null)).toBe(true);
    expect(new Ajv().compile(result.schema as never)(42)).toBe(true);
  });

  it("splices a nested bare union into its parent union", () => {
    expect(
      googleSafeJsonSchema({ anyOf: [{ type: "boolean" }, { anyOf: [{ type: "string" }, { type: "number" }] }] })
        .schema,
    ).toEqual({ anyOf: [{ type: "boolean" }, { type: "string" }, { type: "number" }] });
  });

  it("never emits an empty enum, an empty union, or a tuple items", () => {
    expect(googleSafeJsonSchema({ type: "string", enum: [null] }).schema).toEqual({ type: "string", nullable: true });
    expect(googleSafeJsonSchema({ anyOf: [{ type: "null" }] }).schema).toEqual({});
    expect(googleSafeJsonSchema({ type: "array", items: [{ type: "string" }, { type: "number" }] }).schema).toEqual({
      type: "array",
    });
  });

  it("reports every rewrite against an escaped JSON pointer", () => {
    const result = googleSafeJsonSchema({
      type: "object",
      properties: { "a/b": { type: "string", const: "x", format: "uuid" } },
    });

    expect(result.changes.map(({ pointer, keyword, action }) => `${pointer} ${keyword} ${action}`)).toEqual([
      "#/properties/a~1b const rewritten",
      "#/properties/a~1b format removed",
    ]);
    expect(result.changes.every(({ detail }) => detail.length > 0)).toBe(true);
  });

  it("is pure, so the document it was handed is never mutated", () => {
    const document = {
      $schema: "http://json-schema.org/draft-07/schema#",
      type: "object",
      properties: { a: { anyOf: [{ type: "string", const: "x" }, { type: "null" }] } },
    };
    const before = JSON.stringify(document);
    googleSafeJsonSchema(document);

    expect(JSON.stringify(document)).toBe(before);
  });
});

describe("serving-provider routing", () => {
  it("recognises every Google gateway slug and no other provider", () => {
    for (const provider of ["vertex", "google", "gemini", "google-vertex", "vertex-ai", "GOOGLE", "google_ai_studio"])
      expect(isGoogleServingProvider(provider), provider).toBe(true);
    for (const provider of NON_GOOGLE_PROVIDERS) expect(isGoogleServingProvider(provider), provider).toBe(false);
    expect(isGoogleServingProvider(undefined)).toBe(false);
    expect(isGoogleServingProvider(null)).toBe(false);
    expect(isGoogleServingProvider("")).toBe(false);
  });

  it("hands every other provider the caller's own document, by reference", () => {
    const document = { $schema: "http://json-schema.org/draft-07/schema#", oneOf: [{ type: "string" }] };

    expect(providerWireInputSchema(document, "azure")).toBe(document);
    expect(providerWireInputSchema(document, undefined)).toBe(document);
    expect(providerWireInputSchema(undefined, "vertex")).toBeUndefined();
    expect(providerWireInputSchema(document, "vertex")).not.toBe(document);
  });
});

describe("the shipped tool catalog on the Google wire", () => {
  it("ships a catalog that Google rejects before the transform runs", () => {
    const declared = JSON.stringify(declaredTools);

    expect(declaredTools.length).toBeGreaterThanOrEqual(46);
    for (const keyword of ["$schema", "oneOf", "const", "exclusiveMinimum", "additionalProperties"])
      expect(declared, keyword).toContain(`"${keyword}"`);
    expect(declared).toContain('"enum":[5,10,25,100]');
    expect(declared).toContain('"type":"null"');
  });

  it("emits only dialect keys, proto types, string enums and typed nullables", () => {
    const offenders = googleNodes().flatMap(({ label, node }) => {
      const failures = Object.keys(node)
        .filter((key) => !GOOGLE_SCHEMA_KEYS.has(key))
        .map((key) => `${label} ships ${key}`);
      if (node.type !== undefined && !(typeof node.type === "string" && GOOGLE_SCHEMA_TYPES.has(node.type)))
        failures.push(`${label} declares type ${JSON.stringify(node.type)}`);
      if (node.enum !== undefined && node.type !== "string") failures.push(`${label} enums a non-string`);
      if (Array.isArray(node.enum) && !node.enum.every((value) => typeof value === "string"))
        failures.push(`${label} enums a non-string value`);
      if (Array.isArray(node.enum) && node.enum.length === 0) failures.push(`${label} ships an empty enum`);
      if (node.nullable !== undefined && typeof node.type !== "string")
        failures.push(`${label} is nullable with no type`);
      if (Array.isArray(node.anyOf) && node.anyOf.length === 0) failures.push(`${label} ships an empty union`);
      if (Object.keys(node).length === 0) failures.push(`${label} is an empty node`);

      return failures;
    });

    expect(googleNodes().length).toBeGreaterThan(900);
    expect(offenders, offenders.join("\n")).toEqual([]);
  });

  it("carries no keyword the Google Schema message has no field for", () => {
    const offenders = googleNodes().flatMap(({ label, node }) =>
      NO_GOOGLE_FIELD.filter((keyword) => Object.hasOwn(node, keyword)).map(
        (keyword) => `${label} still ships ${keyword}`,
      ),
    );

    expect(NO_GOOGLE_FIELD.every((keyword) => !GOOGLE_SCHEMA_KEYS.has(keyword))).toBe(true);
    expect(offenders, offenders.join("\n")).toEqual([]);
  });

  it("compiles every transformed tool with the bare Ajv the workflow runtime uses", () => {
    const failures = googleTools.flatMap(({ name, inputSchema }) => {
      try {
        new Ajv().compile(inputSchema as never);
        return [];
      } catch (error) {
        return [`${name}: ${(error as Error).message}`];
      }
    });

    expect(failures, failures.join("\n")).toEqual([]);
  });

  it("never rejects an argument shape the untransformed schema accepts", () => {
    const stale: string[] = [];
    const tightened: string[] = [];
    for (const [name, input] of ACCEPTED_TODAY) {
      const before = new Ajv().compile(schemaOf(declaredTools, name) as never);
      const after = new Ajv().compile(schemaOf(googleTools, name) as never);
      if (!before(input)) stale.push(`${name} ${JSON.stringify(input)}`);
      else if (!after(input))
        tightened.push(`${name} ${JSON.stringify(input)} :: ${new Ajv().errorsText(after.errors)}`);
    }

    expect(stale, stale.join("\n")).toEqual([]);
    expect(tightened, tightened.join("\n")).toEqual([]);
  });

  it("still rejects malformed arguments", () => {
    const accepted = REJECTED_TODAY.flatMap(([name, input]) => {
      const after = new Ajv().compile(schemaOf(googleTools, name) as never);

      return after(input) ? [`${name} ${JSON.stringify(input)}`] : [];
    });

    expect(accepted, accepted.join("\n")).toEqual([]);
  });

  it("reports exactly the constructs the provider never receives", () => {
    const changes = changesForShippedCatalog();

    expect(summarizeGoogleSchemaChanges(changes)).toEqual({
      "$schema:removed": 52,
      "additionalProperties:removed": 54,
      "anyOf:collapsed": 40,
      "const:rewritten": 203,
      "enum:removed": 24,
      "exclusiveMinimum:rewritten": 10,
      "nullable:collapsed": 10,
      "nullable:rewritten": 20,
      "oneOf:rewritten": 17,
    });
    expect(summarizeGoogleSchemaChanges(changes.filter((change) => change.loosened))).toEqual({
      "additionalProperties:removed": 54,
      "enum:removed": 24,
      "exclusiveMinimum:rewritten": 2,
      "oneOf:rewritten": 17,
    });
  });

  it("gives every node a type except the fields declared as z.any()", () => {
    const typeless = googleNodes()
      .filter(({ node }) => typeof node.type !== "string" && node.anyOf === undefined)
      .map(({ label }) => label);

    expect(typeless.length).toBe(10);
    expect(typeless.filter((label) => !label.endsWith("/properties/notes"))).toEqual([]);
  });

  it("is idempotent, so a second pass over the wire document changes nothing", () => {
    const drifted = googleTools.flatMap(({ name, inputSchema }) => {
      const again = googleSafeJsonSchema(inputSchema);
      const same = JSON.stringify(again.schema) === JSON.stringify(inputSchema) && again.changes.length === 0;

      return same ? [] : [name];
    });

    expect(drifted, drifted.join("\n")).toEqual([]);
  });

  it("leaves every non-Google provider byte identical to today's document", () => {
    const baseline = JSON.stringify(declaredTools);
    for (const provider of NON_GOOGLE_PROVIDERS) {
      const definitions = getAgentAiToolDefinitions(provider);
      expect(JSON.stringify(definitions), provider).toBe(baseline);
    }
  });
});

describe("the authoritative input gate", () => {
  it("stays the Zod validator, which the wire transform never touches", async () => {
    const pageSize = (schemaOf(googleTools, "list_records") as JsonRecord).properties as JsonRecord;
    expect(pageSize.pageSize).not.toHaveProperty("enum");
    expect(new Ajv().compile(schemaOf(googleTools, "list_records") as never)({ entity: "contact", pageSize: 7 })).toBe(
      true,
    );

    const coerced = await normalizeAgentAiToolInput("list_records", { entity: "contact", pageSize: "25" }, 400);
    const rejected = await normalizeAgentAiToolInput("list_records", { entity: "contact", pageSize: 7 }, 400);

    expect(coerced).toEqual({ ok: true, input: { entity: "contact", page: 1, pageSize: 25 } });
    expect(rejected.ok).toBe(false);
  });

  it("still refuses an unknown key wherever additionalProperties was dropped", async () => {
    const wire = new Ajv().compile(schemaOf(googleTools, "get_activities") as never);
    expect(wire({ bogusParam: 1 })).toBe(true);

    const root = await normalizeAgentAiToolInput("get_activities", { bogusParam: 1 }, 400);
    const nested = await normalizeAgentAiToolInput(
      "create_contacts",
      { contacts: [{ firstName: "A", lastName: "B", bogus: 1 }] },
      400,
    );

    expect(root).toMatchObject({ ok: false });
    expect(nested).toMatchObject({ ok: false });
  });
});

describe("the transform on the wire", () => {
  it("is asked for by serving provider where the workflow builds its tool shells", () => {
    const source = readFileSync(join(REPO_ROOT, "workflows", "agent-turn.ts"), "utf8");

    expect(source).toContain("getAgentAiToolDefinitions(servingProvider)");
    expect(source).toContain("loadAgentToolShells(surface, payload.turnBudget.servingProvider)");
    expect(source).not.toContain("getAgentAiToolDefinitions()");
  });
});
