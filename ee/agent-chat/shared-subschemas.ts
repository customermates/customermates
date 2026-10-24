type SchemaNode = Record<string, unknown>;

function isSchemaNode(value: unknown): value is SchemaNode {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

const SHARED_SUBSCHEMA_MIN_CHARS = 1_000;
const SHARED_DEFINITION_PREFIX = "#/definitions/";

export function shareRepeatedSubschemas<T>(document: T): T {
  if (!isSchemaNode(document) || "definitions" in document || "$defs" in document) return document;
  const counts = new Map<string, number>();
  const visit = (schema: unknown, onSchema: (node: SchemaNode, children: () => void) => void) => {
    if (!isSchemaNode(schema)) return;
    onSchema(schema, () => {
      for (const [key, value] of Object.entries(schema)) {
        if (SCHEMA_MAP_KEYWORDS.has(key) && isSchemaNode(value))
          Object.values(value).forEach((child) => visit(child, onSchema));
        else if (SCHEMA_LIST_KEYWORDS.has(key) && Array.isArray(value))
          value.forEach((child) => visit(child, onSchema));
        else if (SCHEMA_KEYWORDS.has(key)) visit(value, onSchema);
      }
    });
  };
  for (const child of schemaChildren(document)) {
    visit(child, (node, children) => {
      const text = JSON.stringify(node);
      if (text.length >= SHARED_SUBSCHEMA_MIN_CHARS) counts.set(text, (counts.get(text) ?? 0) + 1);
      children();
    });
  }
  const definitions: Record<string, unknown> = {};
  const names = new Map<string, string>();
  const rewrite = (schema: unknown, shareable: boolean): unknown => {
    if (!isSchemaNode(schema)) return schema;
    const text = JSON.stringify(schema);
    if (shareable && (counts.get(text) ?? 0) > 1) {
      let name = names.get(text);
      if (!name) {
        name = `shared${names.size + 1}`;
        names.set(text, name);
        definitions[name] = rewrite(schema, false);
      }
      return { $ref: `${SHARED_DEFINITION_PREFIX}${name}` };
    }
    return Object.fromEntries(
      Object.entries(schema).map(([key, value]) => {
        if (SCHEMA_MAP_KEYWORDS.has(key) && isSchemaNode(value))
          return [key, Object.fromEntries(Object.entries(value).map(([name, child]) => [name, rewrite(child, true)]))];
        if (SCHEMA_LIST_KEYWORDS.has(key) && Array.isArray(value))
          return [key, value.map((child) => rewrite(child, true))];
        if (SCHEMA_KEYWORDS.has(key)) return [key, rewrite(value, true)];
        return [key, value];
      }),
    );
  };
  const shared = rewrite(document, false) as Record<string, unknown>;
  return (names.size ? { ...shared, definitions } : document) as T;
}

const SCHEMA_MAP_KEYWORDS = new Set(["properties", "patternProperties"]);
const SCHEMA_LIST_KEYWORDS = new Set(["anyOf", "oneOf", "allOf", "prefixItems"]);
const SCHEMA_KEYWORDS = new Set(["items", "additionalProperties", "not", "contains", "propertyNames"]);

function schemaChildren(schema: SchemaNode): unknown[] {
  return Object.entries(schema).flatMap(([key, value]) => {
    if (SCHEMA_MAP_KEYWORDS.has(key) && isSchemaNode(value)) return Object.values(value);
    if (SCHEMA_LIST_KEYWORDS.has(key) && Array.isArray(value)) return value;
    if (SCHEMA_KEYWORDS.has(key)) return [value];
    return [];
  });
}
