export type TenantModel = { name: string; key: "companyId" | "id"; nullable: boolean; unverifiable?: boolean };

export type StatementScope = {
  unscoped: string[];
  tenantReferences: number;
};

const CATALOG_SCHEMAS = new Set(["information_schema", "pg_catalog"]);
const REFERENCE =
  /\b(FROM|JOIN|INTO|UPDATE|USING)\s+(?:ONLY\s+)?"(\w+)"(?:\s*\.\s*"(\w+|\$\{\w+\})")?(?:\s+(?:AS\s+)?("\w+"|\$\{\w+\}|(?!(?:WHERE|SET|ON|USING|JOIN|LEFT|RIGHT|INNER|CROSS|FULL|GROUP|ORDER|LIMIT|RETURNING|VALUES|SELECT|DEFAULT|FOR|UNION|AND|OR|AS|WITH)\b)[a-z_]\w*))?/gi;

export function tenantModels(schema: string): Map<string, TenantModel> {
  const models = new Map<string, TenantModel>();
  for (const [, name, body] of schema.matchAll(/^model (\w+) \{([\s\S]*?)^\}/gm)) {
    const field = /^\s+companyId\s+String(\?)?/m.exec(body);
    if (field) models.set(name, { name, key: "companyId", nullable: Boolean(field[1]) });
  }
  models.set("Company", { name: "Company", key: "id", nullable: false });
  return models;
}

function escape(text: string) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function qualifier(alias: string) {
  if (alias.startsWith("${")) return escape(alias);
  const bare = alias.replace(/"/g, "");
  return `(?:"${escape(bare)}"|(?<![\\w$"])${escape(bare)})`;
}

function boundPredicate(alias: string | null, column: string, nullable: boolean) {
  const prefix = alias ? `${qualifier(alias)}\\s*\\.\\s*` : `(?<![\\w".])`;
  const bound = `\\$\\{|\\$\\d|ANY\\s*\\(\\s*\\$\\{`;
  const operators = `(?:=\\s*(?:ANY\\s*\\()?\\s*(?:${bound})|IN\\s*\\(\\s*(?:${bound})${nullable ? "|IS\\s+NULL" : ""})`;
  return new RegExp(`${prefix}"${column}"(?:::text)?\\s*${operators}`, "i");
}

function equalityTargets(sql: string, alias: string): Array<{ alias: string; column: string }> {
  const own = `${qualifier(alias)}\\s*\\.\\s*"companyId"`;
  const other = `("\\w+"|\\$\\{\\w+\\}|[a-z_]\\w*)\\s*\\.\\s*"(companyId|id)"`;
  const targets: Array<{ alias: string; column: string }> = [];
  for (const pattern of [new RegExp(`${own}\\s*=\\s*${other}`, "gi"), new RegExp(`${other}\\s*=\\s*${own}`, "gi")])
    for (const match of sql.matchAll(pattern)) targets.push({ alias: match[1].replace(/"/g, ""), column: match[2] });
  return targets;
}

function insertColumns(sql: string, offset: number): string | null {
  const open = sql.indexOf("(", offset);
  const values = sql.slice(offset, open).trim();
  if (open < 0 || values.length > 0) return null;
  const close = sql.indexOf(")", open);
  return close < 0 ? null : sql.slice(open, close);
}

const CONDITIONAL_SCOPE =
  /\(\s*\$\{[^}]*\}(?:::text)?\s+IS\s+NULL\s+OR\s+(?:(?:"\w+"|\w+)\s*\.\s*)?"companyId"\s*=\s*\$\{[^}]*\}(?:::text)?\s*\)/gi;

export function withoutSqlComments(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/--[^\n`]*/g, " ");
}

export function statementScope(
  sql: string,
  models: ReadonlyMap<string, TenantModel>,
  helperScopedModels: ReadonlySet<string> = new Set(),
): StatementScope {
  sql = withoutSqlComments(sql).replace(CONDITIONAL_SCOPE, "TRUE");
  const references: Array<{
    table: string;
    alias: string;
    explicitAlias: boolean;
    model: TenantModel;
    insertColumns: string | null;
    start: number;
    end: number;
  }> = [];
  for (const match of sql.matchAll(REFERENCE)) {
    const [, keyword, first, second, alias] = match;
    const table = second ? `${first}.${second}` : first;
    const model = second
      ? CATALOG_SCHEMAS.has(first)
        ? undefined
        : { name: table, key: "companyId" as const, nullable: false, unverifiable: true }
      : models.get(first);
    if (!model) continue;
    references.push({
      table,
      alias: alias ? alias.replace(/"/g, "") : table,
      explicitAlias: Boolean(alias),
      start: match.index ?? 0,
      end: (match.index ?? 0) + match[0].length,
      model,
      insertColumns: keyword.toUpperCase() === "INTO" ? insertColumns(sql, (match.index ?? 0) + match[0].length) : null,
    });
  }
  if (references.length === 0) return { unscoped: [], tenantReferences: 0 };

  const scoped = new Set<string>();
  const segmentScoped = new Set<(typeof references)[number]>();
  const soleAlias = new Set(references.map((reference) => reference.alias)).size === 1;
  for (const reference of references) {
    const { alias, model } = reference;
    if (model.unverifiable) continue;
    if (helperScopedModels.has(model.name)) {
      scoped.add(alias);
      continue;
    }
    if (reference.insertColumns !== null) {
      if (reference.insertColumns.includes(`"${model.key}"`) || model.nullable) scoped.add(alias);
      continue;
    }
    if (boundPredicate(alias, model.key, model.nullable).test(sql)) scoped.add(alias);
    else if (soleAlias && boundPredicate(null, model.key, model.nullable).test(sql)) scoped.add(alias);
    else if (!reference.explicitAlias) {
      const next = references.find((candidate) => candidate.start > reference.start)?.start ?? sql.length;
      if (boundPredicate(null, model.key, model.nullable).test(sql.slice(reference.end, next)))
        segmentScoped.add(reference);
    }
  }
  for (let changed = true; changed; ) {
    changed = false;
    for (const reference of references) {
      if (scoped.has(reference.alias) || reference.model.key !== "companyId" || reference.model.unverifiable) continue;
      const joined = equalityTargets(sql, reference.alias).some(
        (target) =>
          scoped.has(target.alias) &&
          references.some(
            (candidate) => candidate.alias === target.alias && candidate.model.key === target.column,
          ),
      );
      if (joined) {
        scoped.add(reference.alias);
        changed = true;
      }
    }
  }
  const unscoped = [
    ...new Set(
      references
        .filter((reference) => !scoped.has(reference.alias) && !segmentScoped.has(reference))
        .map((reference) => `${reference.table} ${reference.alias}`),
    ),
  ];
  return { unscoped, tenantReferences: references.length };
}
