export type GoogleSchemaChangeAction = "collapsed" | "merged" | "removed" | "rewritten";

export type GoogleSchemaChange = {
  pointer: string;
  keyword: string;
  action: GoogleSchemaChangeAction;
  detail: string;
  loosened: boolean;
};

export type GoogleSafeSchemaResult = { schema: unknown; changes: GoogleSchemaChange[] };

type SchemaNode = Record<string, unknown>;

export const GOOGLE_SCHEMA_KEY_ORDER = [
  "type",
  "nullable",
  "title",
  "description",
  "default",
  "enum",
  "pattern",
  "minLength",
  "maxLength",
  "minimum",
  "maximum",
  "items",
  "minItems",
  "maxItems",
  "properties",
  "required",
  "minProperties",
  "maxProperties",
  "anyOf",
] as const;

export const GOOGLE_SCHEMA_KEYS: ReadonlySet<string> = new Set(GOOGLE_SCHEMA_KEY_ORDER);

export const GOOGLE_SCHEMA_TYPES: ReadonlySet<string> = new Set([
  "array",
  "boolean",
  "integer",
  "number",
  "object",
  "string",
]);

const GOOGLE_SERVING_PROVIDER_TOKENS: ReadonlySet<string> = new Set([
  "gemini",
  "generativelanguage",
  "google",
  "googleai",
  "vertex",
  "vertexai",
]);

const ANNOTATION_KEYS: ReadonlySet<string> = new Set(["default", "description", "title"]);

const CONSTRAINT_FREE_KEYS: ReadonlySet<string> = new Set([
  "$comment",
  "$defs",
  "$id",
  "$schema",
  "definitions",
  "deprecated",
  "example",
  "examples",
  "propertyOrdering",
  "readOnly",
  "writeOnly",
]);

const NUMERIC_TYPES: ReadonlySet<string> = new Set(["integer", "number"]);

export function isGoogleServingProvider(servingProvider: string | null | undefined) {
  if (typeof servingProvider !== "string") return false;

  return servingProvider
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .some((token) => GOOGLE_SERVING_PROVIDER_TOKENS.has(token));
}

function orderedKeys(node: SchemaNode): SchemaNode {
  const ordered: SchemaNode = {};
  for (const key of GOOGLE_SCHEMA_KEY_ORDER) if (key in node) ordered[key] = node[key];

  return ordered;
}

function isSchemaNode(value: unknown): value is SchemaNode {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function pointerSegment(segment: number | string) {
  return String(segment).replaceAll("~", "~0").replaceAll("/", "~1");
}

function childPointer(pointer: string, ...segments: (number | string)[]) {
  return `${pointer}/${segments.map(pointerSegment).join("/")}`;
}

function isNullOnlyBranch(node: unknown) {
  if (!isSchemaNode(node)) return false;
  const declared = Array.isArray(node.type) ? node.type : [node.type];
  if (declared.length === 0 || !declared.every((entry) => entry === "null")) return false;

  return Object.keys(node).every((key) => key === "type" || ANNOTATION_KEYS.has(key));
}

function alreadyAdmitsNull(node: SchemaNode) {
  return typeof node.type !== "string" && node.enum === undefined && node.anyOf === undefined;
}

function namesEveryValue(description: string, values: readonly unknown[]) {
  return values.every((value) => {
    const rendered = String(value).replaceAll(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(`(^|[^\\w.])${rendered}([^\\w.]|$)`).test(description);
  });
}

function typedBranches(values: readonly unknown[]): SchemaNode[] {
  const strings = values.filter((value): value is string => typeof value === "string");
  const numbers = values.filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  const booleans = values.filter((value) => typeof value === "boolean");
  if (strings.length + numbers.length + booleans.length !== values.length) return [];

  const branches: SchemaNode[] = [];
  if (strings.length > 0) branches.push({ type: "string", enum: strings });
  if (numbers.length > 0) {
    branches.push({
      type: numbers.every((value) => Number.isInteger(value)) ? "integer" : "number",
      minimum: Math.min(...numbers),
      maximum: Math.max(...numbers),
    });
  }
  if (booleans.length > 0) branches.push({ type: "boolean" });

  return branches;
}

export function googleSafeJsonSchema(document: unknown): GoogleSafeSchemaResult {
  const changes: GoogleSchemaChange[] = [];

  const record = (
    pointer: string,
    keyword: string,
    action: GoogleSchemaChangeAction,
    detail: string,
    loosened: boolean,
  ) => {
    changes.push({ pointer, keyword, action, detail, loosened });
  };

  const mergeAbsent = (draft: SchemaNode, source: SchemaNode, pointer: string, origin: string) => {
    for (const [key, value] of Object.entries(source)) {
      if (key in draft) {
        record(pointer, key, "merged", `kept this node's ${key} over the ${origin} branch's ${key}`, false);
        continue;
      }
      draft[key] = value;
    }
  };

  const describeValues = (draft: SchemaNode, values: readonly unknown[]) => {
    if (values.length === 0) return;
    const described = typeof draft.description === "string" ? draft.description : "";
    if (namesEveryValue(described, values)) return;

    const listed = `Allowed values: ${values.map((value) => JSON.stringify(value)).join(", ")}.`;
    draft.description = described === "" ? listed : `${described.trimEnd()} ${listed}`;
  };

  const admitNull = (draft: SchemaNode, pointer: string) => {
    if (typeof draft.type === "string") {
      if (Array.isArray(draft.enum)) {
        const values = draft.enum;
        record(pointer, "enum", "removed", `dropped enum ${JSON.stringify(values)} so nullable can admit null`, true);
        delete draft.enum;
        describeValues(draft, values);
      }
      draft.nullable = true;
      record(pointer, "nullable", "rewritten", "a null branch became nullable: true on this node", false);
      return;
    }

    const members = Array.isArray(draft.anyOf) ? draft.anyOf.filter(isSchemaNode) : [];
    if (members.length === 0 || members.some(alreadyAdmitsNull)) {
      record(pointer, "nullable", "collapsed", "a null branch was dropped; this node already admits null", false);
      return;
    }

    const carriers = members.filter((member) => typeof member.type === "string" && member.enum === undefined);
    if (carriers.length > 0) {
      for (const carrier of carriers) carrier.nullable = true;
      const where = `${carriers.length} anyOf branch${carriers.length === 1 ? "" : "es"}`;
      record(pointer, "nullable", "rewritten", `a null branch became nullable: true on ${where}`, false);
      return;
    }

    const typed = members.find((member) => typeof member.type === "string");
    if (typed === undefined) {
      record(pointer, "nullable", "collapsed", "a null branch was dropped; every branch already admits null", false);
      return;
    }

    const values = Array.isArray(typed.enum) ? typed.enum : [];
    record(pointer, "enum", "removed", `dropped enum ${JSON.stringify(values)} on a branch so it can admit null`, true);
    delete typed.enum;
    describeValues(typed, values);
    typed.nullable = true;
    record(pointer, "nullable", "rewritten", "a null branch became nullable: true on an anyOf branch", false);
  };

  const rewriteComposition = (draft: SchemaNode, pointer: string) => {
    if (Array.isArray(draft.oneOf)) {
      const branches = draft.oneOf;
      const existing = Array.isArray(draft.anyOf) ? draft.anyOf : [];
      delete draft.oneOf;
      draft.anyOf = [...existing, ...branches];
      const detail = `moved ${branches.length} oneOf branches into anyOf, which accepts one or more matches`;
      record(pointer, "oneOf", "rewritten", detail, true);
    }

    if (Array.isArray(draft.allOf)) {
      const branches = draft.allOf;
      delete draft.allOf;
      record(pointer, "allOf", "rewritten", `merged ${branches.length} allOf branches into this node`, true);
      for (const branch of branches) if (isSchemaNode(branch)) mergeAbsent(draft, branch, pointer, "allOf");
    }

    if (!("const" in draft)) return;
    const value = draft.const;
    delete draft.const;
    if (typeof value === "string" && draft.enum === undefined) {
      draft.enum = [value];
      record(pointer, "const", "rewritten", `const ${JSON.stringify(value)} became a single-value enum`, false);
      return;
    }

    record(pointer, "const", "removed", `dropped const ${JSON.stringify(value)}; a Google enum holds strings`, true);
    describeValues(draft, [value]);
  };

  const rewriteType = (draft: SchemaNode, pointer: string) => {
    const declared = draft.type;
    if (Array.isArray(declared)) {
      const concrete = declared.filter(
        (entry): entry is string => typeof entry === "string" && GOOGLE_SCHEMA_TYPES.has(entry),
      );
      const existing = Array.isArray(draft.anyOf) ? draft.anyOf : [];
      delete draft.type;
      if (concrete.length === 1) draft.type = concrete[0];
      else if (concrete.length > 1) draft.anyOf = [...existing, ...concrete.map((entry) => ({ type: entry }))];
      const detail = `array-valued type ${JSON.stringify(declared)} has no Google schema equivalent`;
      record(pointer, "type", "rewritten", detail, concrete.length !== 1);

      return declared.includes("null");
    }

    if (declared === "null") {
      delete draft.type;
      record(pointer, "type", "removed", "the null type has no Google schema equivalent", false);
      return true;
    }

    if (typeof declared === "string" && !GOOGLE_SCHEMA_TYPES.has(declared)) {
      delete draft.type;
      record(pointer, "type", "removed", `dropped unsupported type ${JSON.stringify(declared)}`, true);
    }

    return false;
  };

  const rewriteBounds = (draft: SchemaNode, pointer: string) => {
    if (typeof draft.exclusiveMinimum === "number") {
      const exclusive = draft.exclusiveMinimum;
      delete draft.exclusiveMinimum;
      const bound = draft.type === "integer" ? exclusive + 1 : exclusive;
      const existing = draft.minimum;
      draft.minimum = typeof existing === "number" ? Math.max(existing, bound) : bound;
      const detail = `exclusiveMinimum ${exclusive} became minimum ${String(draft.minimum)}`;
      record(pointer, "exclusiveMinimum", "rewritten", detail, draft.type !== "integer");
    }

    if (typeof draft.exclusiveMaximum !== "number") return;
    const exclusive = draft.exclusiveMaximum;
    delete draft.exclusiveMaximum;
    const bound = draft.type === "integer" ? exclusive - 1 : exclusive;
    const existing = draft.maximum;
    draft.maximum = typeof existing === "number" ? Math.min(existing, bound) : bound;
    const detail = `exclusiveMaximum ${exclusive} became maximum ${String(draft.maximum)}`;
    record(pointer, "exclusiveMaximum", "rewritten", detail, draft.type !== "integer");
  };

  const rewriteEnum = (draft: SchemaNode, pointer: string) => {
    if (!Array.isArray(draft.enum)) return false;

    const declared = draft.enum;
    const values = declared.filter((value) => value !== null);
    const admitsNull = values.length !== declared.length;

    if (values.length === 0) {
      delete draft.enum;
      record(pointer, "enum", "removed", "dropped an enum that only held null", true);
      return admitsNull;
    }

    if (values.every((value) => typeof value === "string") && (draft.type === undefined || draft.type === "string")) {
      draft.enum = values;
      draft.type = "string";
      return admitsNull;
    }

    delete draft.enum;
    const dropped = JSON.stringify(declared);
    record(pointer, "enum", "removed", `dropped enum ${dropped}; a Google enum holds strings only`, true);

    const branches = typedBranches(values);
    if (draft.type === undefined && draft.anyOf === undefined && branches.length === 1)
      mergeAbsent(draft, branches[0], pointer, "enum");
    else if (draft.type === undefined && draft.anyOf === undefined && branches.length > 1) draft.anyOf = branches;
    else if (typeof draft.type === "string" && NUMERIC_TYPES.has(draft.type)) {
      const numbers = values.filter((value): value is number => typeof value === "number" && Number.isFinite(value));
      if (numbers.length > 0 && typeof draft.minimum !== "number") draft.minimum = Math.min(...numbers);
      if (numbers.length > 0 && typeof draft.maximum !== "number") draft.maximum = Math.max(...numbers);
    }

    describeValues(draft, values);
    return admitsNull;
  };

  const rewrite = (node: unknown, pointer: string): SchemaNode => {
    if (!isSchemaNode(node)) return {};

    const draft: SchemaNode = { ...node };
    rewriteComposition(draft, pointer);
    let admitsNull = rewriteType(draft, pointer);
    rewriteBounds(draft, pointer);

    if (isSchemaNode(draft.properties)) {
      draft.properties = Object.fromEntries(
        Object.entries(draft.properties).map(([key, value]) => [
          key,
          rewrite(value, childPointer(pointer, "properties", key)),
        ]),
      );
    } else if (draft.properties !== undefined) {
      delete draft.properties;
      record(pointer, "properties", "removed", "dropped properties that were not a schema map", true);
    }

    if (Array.isArray(draft.items)) {
      delete draft.items;
      record(pointer, "items", "removed", "tuple-form items has no Google schema equivalent", true);
    } else if (draft.items !== undefined) draft.items = rewrite(draft.items, childPointer(pointer, "items"));

    if (Array.isArray(draft.anyOf)) {
      const declared = draft.anyOf;
      const members: SchemaNode[] = [];
      declared.forEach((member, index) => {
        if (isNullOnlyBranch(member)) {
          admitsNull = true;
          return;
        }

        const branchPointer = childPointer(pointer, "anyOf", index);
        const rewritten = rewrite(member, branchPointer);
        const keys = Object.keys(rewritten);
        if (keys.length === 1 && keys[0] === "anyOf" && Array.isArray(rewritten.anyOf)) {
          members.push(...(rewritten.anyOf as SchemaNode[]));
          record(branchPointer, "anyOf", "collapsed", "spliced a nested union into its parent union", false);
          return;
        }

        members.push(rewritten);
      });

      delete draft.anyOf;
      if (members.length > 1) draft.anyOf = members;
      else if (members.length === 1) {
        mergeAbsent(draft, members[0], pointer, "anyOf");
        record(pointer, "anyOf", "collapsed", "a union with one remaining branch became that branch", false);
      } else record(pointer, "anyOf", "collapsed", "every branch of this union was dropped", true);
    }

    if (rewriteEnum(draft, pointer)) admitsNull = true;
    if (admitsNull) admitNull(draft, pointer);

    for (const key of Object.keys(draft)) {
      if (GOOGLE_SCHEMA_KEYS.has(key)) continue;
      const detail = `${key} is not a field of the Google function-declaration schema`;
      record(pointer, key, "removed", detail, !CONSTRAINT_FREE_KEYS.has(key));
    }

    const kept = orderedKeys(draft);

    if (kept.nullable === true && typeof kept.type !== "string") {
      delete kept.nullable;
      record(pointer, "nullable", "removed", "nullable without a type is rejected by the runtime validator", false);
    }

    if (Array.isArray(kept.enum) && (kept.enum.length === 0 || kept.type !== "string")) {
      delete kept.enum;
      record(pointer, "enum", "removed", "an enum survives only as a non-empty list of strings on a string", true);
    }

    if (Array.isArray(kept.anyOf) && kept.anyOf.length === 0) delete kept.anyOf;
    else if (Array.isArray(kept.anyOf)) kept.anyOf = kept.anyOf.map((member) => orderedKeys(member as SchemaNode));

    const required = kept.required;
    if (required !== undefined && !(Array.isArray(required) && required.every((entry) => typeof entry === "string"))) {
      delete kept.required;
      record(pointer, "required", "removed", "dropped a required list that was not a list of property names", true);
    }

    return kept;
  };

  if (!isSchemaNode(document)) return { schema: document, changes };

  return { schema: rewrite(document, "#"), changes };
}

export function providerWireInputSchema(document: unknown, servingProvider: string | null | undefined): unknown {
  if (!isGoogleServingProvider(servingProvider)) return document;

  return googleSafeJsonSchema(document).schema;
}

export function summarizeGoogleSchemaChanges(changes: readonly GoogleSchemaChange[]) {
  const counts = new Map<string, number>();
  for (const change of changes) {
    const key = `${change.keyword}:${change.action}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  return Object.fromEntries(
    [...counts.entries()].sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0)),
  );
}
