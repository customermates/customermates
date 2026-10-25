const DEFINITION_PREFIX = "#/definitions/";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function inlineSchemaDefinitions(document: unknown): unknown {
  if (!isRecord(document) || !isRecord(document.definitions)) return document;
  const definitions = document.definitions;
  const inline = (node: unknown): unknown => {
    if (Array.isArray(node)) return node.map(inline);
    if (!isRecord(node)) return node;
    const ref = node.$ref;
    if (typeof ref === "string" && ref.startsWith(DEFINITION_PREFIX) && Object.keys(node).length === 1) {
      const target = definitions[ref.slice(DEFINITION_PREFIX.length)];
      if (target !== undefined) return inline(target);
    }
    return Object.fromEntries(Object.entries(node).map(([key, value]) => [key, inline(value)]));
  };
  const { definitions: _definitions, ...rest } = document;
  void _definitions;
  return inline(rest);
}
