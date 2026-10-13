import ts from "typescript";

export const REGISTRY_NAME_PATTERN = /allow|exempt|exception|not_?yet|waive|ignore|skip|tolerat|known_?violation/i;

type Constants = ReadonlyMap<string, ts.Expression>;

export type RegistryShape = { valueIsMember?: boolean };

function parse(path: string, source: string) {
  return ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
}

function unwrap(expression: ts.Expression): ts.Expression {
  if (
    ts.isAsExpression(expression) ||
    ts.isSatisfiesExpression(expression) ||
    ts.isParenthesizedExpression(expression) ||
    ts.isTypeAssertionExpression(expression)
  )
    return unwrap(expression.expression);
  return expression;
}

function topLevelConstants(file: ts.SourceFile): Map<string, ts.Expression> {
  const constants = new Map<string, ts.Expression>();
  for (const statement of file.statements) {
    if (!ts.isVariableStatement(statement) || !(statement.declarationList.flags & ts.NodeFlags.Const)) continue;
    for (const declaration of statement.declarationList.declarations)
      if (ts.isIdentifier(declaration.name) && declaration.initializer)
        constants.set(declaration.name.text, unwrap(declaration.initializer));
  }
  return constants;
}

export function exceptionNamedConstants(path: string, source: string): string[] {
  return [...topLevelConstants(parse(path, source)).keys()].filter((name) => REGISTRY_NAME_PATTERN.test(name));
}

function unsupported(path: string, name: string, node: ts.Node, what: string): never {
  const file = node.getSourceFile();
  const line = file.getLineAndCharacterOfPosition(node.getStart(file)).line + 1;
  throw new Error(
    `${path}#${name} line ${line}: unsupported exception registry construction (${what}): ` +
      `${node.getText(file).slice(0, 80)}. Use literal arrays, Sets, Maps or object literals.`,
  );
}

function literalText(expression: ts.Expression, constants: Constants, seen = new Set<string>()): string | undefined {
  const node = unwrap(expression);
  if (ts.isStringLiteralLike(node)) return node.text;
  if (ts.isNumericLiteral(node)) return node.text;
  if (ts.isRegularExpressionLiteral(node)) return node.text;
  if (ts.isIdentifier(node) && !seen.has(node.text)) {
    const value = constants.get(node.text);
    return value ? literalText(value, constants, new Set(seen).add(node.text)) : undefined;
  }
  return undefined;
}

function propertyKey(property: ts.ObjectLiteralElementLike, constants: Constants): string | undefined {
  if (!ts.isPropertyAssignment(property) && !ts.isShorthandPropertyAssignment(property)) return undefined;
  const { name } = property;
  if (ts.isIdentifier(name) || ts.isStringLiteralLike(name) || ts.isNumericLiteral(name)) return name.text;
  if (ts.isComputedPropertyName(name)) return literalText(name.expression, constants);
  return undefined;
}

type Context = { path: string; name: string; constants: Constants; shape: RegistryShape };

function valueMembers(key: string, value: ts.Expression, context: Context): string[] {
  const node = unwrap(value);
  const text = literalText(node, context.constants);
  if (text !== undefined) return [context.shape.valueIsMember ? `${key} -> ${text}` : key];
  if (ts.isArrayLiteralExpression(node))
    return node.elements.length === 0
      ? [key]
      : node.elements.map((element) => `${key} [${elementText(element, context)}]`);
  if (ts.isObjectLiteralExpression(node)) {
    const members: string[] = [];
    for (const property of node.properties) {
      const name = propertyKey(property, context.constants);
      if (name === undefined || !ts.isPropertyAssignment(property))
        return unsupported(context.path, context.name, property, "computed or spread exception detail");
      if (name === "reason") continue;
      const detail = unwrap(property.initializer);
      if (ts.isArrayLiteralExpression(detail))
        members.push(...detail.elements.map((element) => `${key} [${name}: ${elementText(element, context)}]`));
      else {
        const detailText = literalText(detail, context.constants);
        if (detailText === undefined)
          return unsupported(context.path, context.name, detail, "non-literal exception detail");
        members.push(`${key} [${name}=${detailText}]`);
      }
    }
    return members.length > 0 ? members : [key];
  }
  return unsupported(context.path, context.name, node, "non-literal exception value");
}

function elementText(element: ts.Expression, context: Context): string {
  const node = unwrap(element);
  const text = literalText(node, context.constants);
  if (text !== undefined) return text;
  if (ts.isArrayLiteralExpression(node)) return node.elements.map((part) => elementText(part, context)).join(" | ");
  if (ts.isObjectLiteralExpression(node))
    return node.properties
      .map((property) => {
        const name = propertyKey(property, context.constants);
        if (name === undefined || !ts.isPropertyAssignment(property))
          return unsupported(context.path, context.name, property, "computed or spread exception detail");
        return `${name}=${elementText(property.initializer, context)}`;
      })
      .sort()
      .join(", ");
  return unsupported(context.path, context.name, node, "non-literal exception member");
}

function spreadMembers(spread: ts.SpreadElement, context: Context, keyed: boolean): string[] {
  const target = unwrap(spread.expression);
  if (ts.isIdentifier(target) && context.constants.has(target.text))
    return collectionMembers(context.constants.get(target.text)!, context);
  if (keyed && ts.isCallExpression(target)) {
    const lists = target.arguments.map(unwrap).filter(ts.isArrayLiteralExpression);
    const others = target.arguments.map(unwrap).filter((argument) => !ts.isArrayLiteralExpression(argument));
    if (lists.length === 1 && others.every((argument) => literalText(argument, context.constants) !== undefined))
      return lists[0].elements.map((element) => elementText(element, context));
  }
  return unsupported(context.path, context.name, spread, "spread of a non-literal source");
}

function collectionMembers(initializer: ts.Expression, context: Context): string[] {
  const node = unwrap(initializer);
  if (ts.isObjectLiteralExpression(node))
    return node.properties.flatMap((property) => {
      if (ts.isSpreadAssignment(property)) {
        const target = unwrap(property.expression);
        if (ts.isIdentifier(target) && context.constants.has(target.text))
          return collectionMembers(context.constants.get(target.text)!, context);
        return unsupported(context.path, context.name, property, "spread of a non-literal source");
      }
      const key = propertyKey(property, context.constants);
      if (key === undefined || !ts.isPropertyAssignment(property))
        return unsupported(context.path, context.name, property, "computed or method exception key");
      return valueMembers(key, property.initializer, context);
    });
  if (ts.isArrayLiteralExpression(node))
    return node.elements.flatMap((element) =>
      ts.isSpreadElement(element) ? spreadMembers(element, context, false) : [elementText(element, context)],
    );
  if (ts.isNewExpression(node) && ts.isIdentifier(node.expression) && ["Set", "Map"].includes(node.expression.text)) {
    const [entries] = node.arguments ?? [];
    if (!entries) return [];
    const list = unwrap(entries);
    if (!ts.isArrayLiteralExpression(list)) return unsupported(context.path, context.name, list, "non-literal entries");
    if (node.expression.text === "Set") return collectionMembers(list, context);
    return list.elements.flatMap((element) => {
      if (ts.isSpreadElement(element)) return spreadMembers(element, context, true);
      const entry = unwrap(element);
      if (!ts.isArrayLiteralExpression(entry) || entry.elements.length !== 2)
        return unsupported(context.path, context.name, entry, "Map entry that is not a [key, value] literal");
      const key = literalText(entry.elements[0], context.constants);
      if (key === undefined) return unsupported(context.path, context.name, entry.elements[0], "non-literal Map key");
      return valueMembers(key, entry.elements[1], context);
    });
  }
  return unsupported(context.path, context.name, node, "not a literal array, Set, Map or object");
}

export function registryMembers(path: string, source: string, name: string, shape: RegistryShape = {}) {
  const constants = topLevelConstants(parse(path, source));
  const initializer = constants.get(name);
  if (!initializer) return undefined;
  const seen = new Map<string, number>();
  return collectionMembers(initializer, { path, name, constants, shape })
    .map((member) => {
      const occurrence = (seen.get(member) ?? 0) + 1;
      seen.set(member, occurrence);
      return occurrence === 1 ? member : `${member} #${occurrence}`;
    })
    .sort();
}
