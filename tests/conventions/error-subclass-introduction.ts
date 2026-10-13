import ts from "typescript";

export type SourceFile = { path: string; source: string };
export type ErrorClass = { path: string; name: string; parent: string };

const BUILTIN_ERROR = /^(?:\w+)?Error$/;

function parse({ path, source }: SourceFile) {
  return ts.createSourceFile(
    path,
    source,
    ts.ScriptTarget.Latest,
    true,
    path.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
}

function classDeclarations(file: ts.SourceFile) {
  const classes: Array<{ name: string; parent: string }> = [];
  const aliases = new Map<string, string>();
  const visit = (node: ts.Node) => {
    if (ts.isImportSpecifier(node) && node.propertyName) aliases.set(node.name.text, node.propertyName.text);
    if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.initializer &&
      ts.isIdentifier(node.initializer)
    )
      aliases.set(node.name.text, node.initializer.text);
    if (ts.isClassLike(node)) {
      const parent = node.heritageClauses
        ?.find((clause) => clause.token === ts.SyntaxKind.ExtendsKeyword)
        ?.types[0]?.expression.getText(file);
      const name =
        node.name?.text ??
        (ts.isVariableDeclaration(node.parent) && ts.isIdentifier(node.parent.name) ? node.parent.name.text : undefined);
      if (parent) classes.push({ name: name ?? "anonymous", parent });
    }
    ts.forEachChild(node, visit);
  };
  visit(file);
  return { classes, aliases };
}

function resolve(name: string, aliases: ReadonlyMap<string, string>) {
  const seen = new Set<string>();
  let current = name;
  while (aliases.has(current) && !seen.has(current)) {
    seen.add(current);
    current = aliases.get(current) ?? current;
  }
  return current;
}

export function errorClasses(files: SourceFile[]): ErrorClass[] {
  const declared = files.map((file) => ({ path: file.path, ...classDeclarations(parse(file)) }));
  const errorNames = new Set<string>();
  const found = new Map<string, ErrorClass>();
  for (let changed = true; changed; ) {
    changed = false;
    for (const { path, classes, aliases } of declared)
      for (const { name, parent } of classes) {
        const resolved = resolve(parent, aliases);
        if (!BUILTIN_ERROR.test(resolved) && !errorNames.has(resolved)) continue;
        const key = `${path}:${name}`;
        if (found.has(key)) continue;
        found.set(key, { path, name, parent: resolved });
        errorNames.add(name);
        changed = true;
      }
  }
  return [...found.values()].sort((a, b) => `${a.path}:${a.name}`.localeCompare(`${b.path}:${b.name}`));
}

export function introducedErrorClasses(
  head: ErrorClass[],
  readBase: (path: string) => string | undefined,
  listBase: () => string[],
): string[] {
  const samePath = (candidate: ErrorClass) => {
    const source = readBase(candidate.path);
    return source === undefined ? [] : errorClasses([{ path: candidate.path, source }]);
  };
  let everywhere: ErrorClass[] | undefined;
  const anywhere = () =>
    (everywhere ??= errorClasses(
      listBase().flatMap((path) => {
        const source = readBase(path);
        return source === undefined ? [] : [{ path, source }];
      }),
    ));
  const matches = (base: ErrorClass[], candidate: ErrorClass) =>
    base.some((existing) => existing.name === candidate.name && existing.parent === candidate.parent);
  return head
    .filter((candidate) => !matches(samePath(candidate), candidate) && !matches(anywhere(), candidate))
    .map((candidate) => `${candidate.path}:${candidate.name} extends ${candidate.parent}`);
}
