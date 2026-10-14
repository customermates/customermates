import { join, relative, sep } from "node:path";

import ts from "typescript";
import { describe, expect, it } from "vitest";

import { statementScope, tenantModels } from "./raw-sql-scope";
import { REPO_ROOT, REPO_SCAN_TIMEOUT_MS, parseSource, readSourceText, walkFiles } from "./walk";
import { unreviewedExceptionAdditions } from "./exception-membership";

const RAW_METHODS = new Set(["$queryRaw", "$executeRaw", "$queryRawUnsafe", "$executeRawUnsafe"]);
const EXCLUDED = [join("prisma", "migrations"), "scripts", "tests", "generated", "node_modules", ".next", ".runs"];
const SCHEMA = readSourceText(join(REPO_ROOT, "prisma", "schema.prisma"));

const SCOPED_HELPERS: Record<string, { call: RegExp; models: string[] }> = {
  "features/trash/prisma-trash.repository.ts": { call: /\bthis\.conditions\(/, models: ["TrashItem"] },
  "features/command-palette/prisma-search-catalog.repository.ts": {
    call: /\bscopeFilter\(/,
    models: ["SearchCatalogEntry"],
  },
};

const ALLOWLIST: Record<string, string> = {
  "ee/agent-chat/prisma-agent-chat.repository.ts:PrismaAgentChatRepo.admitsHostedAiGlobalSpend on AgentUsageEvent":
    "Platform-wide hosted AI spend admission sums every workspace's reservations under the global admission lock",
  "ee/agent-chat/prisma-agent-chat.repository.ts:PrismaAgentChatRepo.releaseStaleRetrievalReservations on AgentUsageEvent":
    "The stale retrieval sweep releases expired reservations of every workspace when no companyId is given",
  "ee/operator/prisma-operator.repository.ts:PrismaOperatorRepo.deleteWorkspaceUnscoped on workflow.${table}, workflow.workflow_runs":
    "Operator workspace deletion removes workflow engine runs whose input names the deleted companyId",
  "ee/operator/prisma-operator.repository.ts:PrismaOperatorRepo.getUserSummaryUnscoped on AuthUser, User":
    "Operator console platform summary counts verified members across all workspaces",
  "ee/operator/prisma-operator.repository.ts:PrismaOperatorRepo.listWorkspaceTagsUnscoped on Company":
    "Operator console lists the distinct workspace tags of all companies",
  "features/records/prisma-record.repository.ts:PrismaRecordRepo.claimDueUnscoped on RecordOperation, RecordSchemaState":
    "The record operation sweep leases due operations across workspaces with one FOR UPDATE SKIP LOCKED claim",
  "features/user/prisma-user.repository.ts:PrismaUserRepo.findAuthUserCompanyIdForUpdateUnscoped on AuthUser":
    "Pre-tenant registration locks the signed-in AuthUser row by id to learn which workspace it is bound to",
  "features/wiki/prisma-wiki-section.repository.ts:PrismaWikiSectionRepo.findCompaniesWithStaleSectionsUnscoped on WikiPage":
    "The daily Knowledge Base section sync finds the workspaces whose pages have stale sections across all companies",
  "prisma/seeds/run.ts:runSyntheticSeed on AgentMessage":
    "Seed fix-up resets the global AgentMessage sequence to the highest seeded value",
};
const ALLOWLIST_CEILING = 9;

type RawCall = { site: string; line: number; evidence: string };

function outermostSymbol(node: ts.Node): string {
  let symbol = "<module>";
  for (let current: ts.Node | undefined = node.parent; current; current = current.parent) {
    if (ts.isMethodDeclaration(current) || ts.isGetAccessorDeclaration(current)) {
      const owner = ts.isClassLike(current.parent) && current.parent.name ? `${current.parent.name.text}.` : "";
      symbol = `${owner}${current.name.getText()}`;
    } else if (ts.isFunctionDeclaration(current) && current.name) symbol = current.name.text;
    else if (
      ts.isVariableDeclaration(current) &&
      ts.isIdentifier(current.name) &&
      current.initializer &&
      (ts.isArrowFunction(current.initializer) || ts.isFunctionExpression(current.initializer)) &&
      ts.isVariableStatement(current.parent.parent) &&
      ts.isSourceFile(current.parent.parent.parent)
    )
      symbol = current.name.text;
  }
  return symbol;
}

function scopeOf(node: ts.Node): ts.Node {
  let scope: ts.Node = node.getSourceFile();
  for (let current: ts.Node | undefined = node.parent; current; current = current.parent)
    if (ts.isFunctionLike(current)) scope = current;
  return scope;
}

function initializers(scope: ts.Node, names: Set<string>): string[] {
  const found: string[] = [];
  const visit = (node: ts.Node) => {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && names.has(node.name.text) && node.initializer)
      found.push(node.initializer.getText());
    ts.forEachChild(node, visit);
  };
  visit(scope);
  return found;
}

function rawCalls(path: string): RawCall[] {
  const file = relative(REPO_ROOT, path);
  const source = parseSource(path, readSourceText(path));
  const calls: RawCall[] = [];
  const visit = (node: ts.Node) => {
    const callee = ts.isCallExpression(node)
      ? node.expression
      : ts.isTaggedTemplateExpression(node)
        ? node.tag
        : undefined;
    const target = callee && ts.isPropertyAccessExpression(callee) ? callee.name.text : undefined;
    if (target && RAW_METHODS.has(target)) {
      const referenced = new Set<string>();
      const collect = (child: ts.Node) => {
        if (ts.isIdentifier(child)) referenced.add(child.text);
        ts.forEachChild(child, collect);
      };
      if (ts.isCallExpression(node)) node.arguments.forEach(collect);
      else if (ts.isTaggedTemplateExpression(node)) collect(node.template);
      calls.push({
        site: `${file.split(sep).join("/")}:${outermostSymbol(node)}`,
        line: source.getLineAndCharacterOfPosition(node.getStart()).line + 1,
        evidence: [node.getText(), ...initializers(scopeOf(node), referenced)].join("\n"),
      });
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return calls;
}

function inventory(): RawCall[] {
  return walkFiles(REPO_ROOT, (path) => {
    const file = relative(REPO_ROOT, path);
    if (!/\.(ts|tsx)$/.test(file) || /\.test\.tsx?$/.test(file) || file.split(sep).includes("__tests__")) return false;
    return !EXCLUDED.some((excluded) => file === excluded || file.startsWith(excluded + sep));
  }).flatMap(rawCalls);
}

function allowlistKey(site: string, tables: Iterable<string>) {
  return `${site} on ${[...new Set(tables)].sort().join(", ")}`;
}

function unscopedTables(call: RawCall, models: ReturnType<typeof tenantModels>): string[] {
  const helper = SCOPED_HELPERS[call.site.slice(0, call.site.lastIndexOf(":"))];
  const helperModels = new Set(helper?.call.test(call.evidence) ? helper.models : []);
  return statementScope(call.evidence, models, helperModels).unscoped.map((reference) => reference.split(" ")[0]);
}

function allowlistFindings(calls: Array<RawCall & { tables: string[] }>, allowlist: Record<string, string>) {
  const bySite = new Map<string, Set<string>>();
  for (const call of calls.filter((candidate) => candidate.tables.length > 0))
    for (const table of call.tables) bySite.set(call.site, (bySite.get(call.site) ?? new Set()).add(table));
  const offenders: string[] = [];
  const used = new Set<string>();
  for (const call of calls.filter((candidate) => candidate.tables.length > 0)) {
    const key = allowlistKey(call.site, bySite.get(call.site) ?? []);
    if (key in allowlist) used.add(key);
    else offenders.push(`${call.site} (line ${call.line}) leaves ${call.tables.join(", ")} unscoped`);
  }
  return { offenders: [...new Set(offenders)], stale: Object.keys(allowlist).filter((key) => !used.has(key)) };
}

describe("raw SQL tenancy", () => {
  it(
    "scopes every tenant table alias in every raw statement unless the method and its tables are allowlisted",
    () => {
      const models = tenantModels(SCHEMA);
      const calls = inventory().map((call) => ({ ...call, tables: unscopedTables(call, models) }));
      const { offenders, stale } = allowlistFindings(calls, ALLOWLIST);
      expect(offenders, "Add a bound companyId predicate to each tenant alias or join it on companyId").toEqual([]);
      expect(stale, "The allowlist only shrinks: remove entries whose raw SQL is now scoped or gone").toEqual([]);
      expect(
        Object.keys(ALLOWLIST).length,
        "The allowlist only shrinks: lower the ceiling with it",
      ).toBeLessThanOrEqual(ALLOWLIST_CEILING);
      for (const [site, reason] of Object.entries(ALLOWLIST)) expect(reason.length, site).toBeGreaterThan(40);
    },
    REPO_SCAN_TIMEOUT_MS,
  );

  it("sees the expected raw SQL surface", () => {
    const models = tenantModels(SCHEMA);
    const calls = inventory();
    expect(calls.length).toBeGreaterThan(100);
    expect(models.get("CrmRecord")).toMatchObject({ key: "companyId", nullable: false });
    expect(models.get("SearchCatalogEntry")).toMatchObject({ nullable: true });
    expect(models.get("Company")).toMatchObject({ key: "id" });
    expect(models.has("DocsChunk")).toBe(false);
  });

  describe("statement scope fixtures", () => {
    const models = tenantModels(SCHEMA);
    const scope = (sql: string, helperModels: string[] = []) =>
      statementScope(sql, models, new Set(helperModels)).unscoped.map((reference) => reference.split(" ")[0]);

    it("accepts table-free statements, global models and catalog probes", () => {
      expect(scope("SELECT pg_advisory_xact_lock(hashtextextended(${companyId}, 0))")).toEqual([]);
      expect(scope("SELECT set_config('lock_timeout', ${timeout}, true)")).toEqual([]);
      expect(scope('SELECT 1 FROM "DocsChunk" c WHERE c."locale" = ${locale}')).toEqual([]);
      expect(scope("SELECT 1 FROM information_schema.columns WHERE table_name = 'DocsChunk'")).toEqual([]);
      expect(scope('WITH units AS (SELECT 1) SELECT * FROM "substringUnits" s JOIN units u ON true')).toEqual([]);
    });

    it("accepts bound, joined, per-subquery and root company scope", () => {
      expect(scope('SELECT 1 FROM "CrmRecord" r WHERE r."companyId" = ${companyId}')).toEqual([]);
      expect(scope('SELECT 1 FROM "CrmRecord" WHERE "companyId" = ANY(${companyIds}::text[])')).toEqual([]);
      expect(
        scope(
          'SELECT 1 FROM "CrmRecord" r JOIN "RecordValue" v ON v."companyId" = r."companyId" WHERE r."companyId" = ${c}',
        ),
      ).toEqual([]);
      expect(
        scope(
          'SELECT (SELECT count(*) FROM "CrmRecord" WHERE "companyId" = ${c}), (SELECT count(*) FROM "EventLog" WHERE "companyId" = ${c})',
        ),
      ).toEqual([]);
      expect(
        scope('SELECT 1 FROM "Company" AS c LEFT JOIN "User" AS u ON u."companyId" = c."id" WHERE c."id" = ANY(${ids})'),
      ).toEqual([]);
      expect(
        scope('INSERT INTO "SearchCatalogEntry" ("id", "companyId", "text") SELECT gen_random_uuid(), ${companyId}, v.text FROM v'),
      ).toEqual([]);
      expect(scope('SELECT 1 FROM "SearchCatalogEntry" e WHERE e."companyId" IS NULL AND e."buildHash" = ${hash}')).toEqual(
        [],
      );
      expect(scope('SELECT 1 FROM "TrashItem" ${item} WHERE ${item}."companyId" = ${companyId}')).toEqual([]);
    });

    it("rejects a tenant table joined only to a global or scoped table", () => {
      expect(scope('SELECT 1 FROM "DocsChunk" d JOIN "CrmRecord" r ON r."id" = d."slug" WHERE d."locale" = ${l}')).toEqual([
        "CrmRecord",
      ]);
      expect(
        scope('SELECT 1 FROM "CrmRecord" r JOIN "RecordValue" v ON v."recordId" = r."id" WHERE r."companyId" = ${c}'),
      ).toEqual(["RecordValue"]);
      expect(
        scope('SELECT 1 FROM "User" u LEFT JOIN "UserRole" r ON r."id" = u."roleId" WHERE u."companyId" = ${c}'),
      ).toEqual(["UserRole"]);
    });

    it("rejects misleading comments, conditional scope and unbound comparisons", () => {
      expect(scope('SELECT 1 FROM "CrmRecord" r -- r."companyId" = ${companyId}\nWHERE r."id" = ${id}')).toEqual([
        "CrmRecord",
      ]);
      expect(scope('SELECT 1 FROM "CrmRecord" r /* r."companyId" = ${companyId} */ WHERE r."id" = ${id}')).toEqual([
        "CrmRecord",
      ]);
      expect(
        scope('UPDATE "AgentUsageEvent" SET "state" = \'released\' WHERE (${c}::text IS NULL OR "companyId" = ${c}::text)'),
      ).toEqual(["AgentUsageEvent"]);
      expect(scope('SELECT 1 FROM "CrmRecord" r WHERE r."companyId" = r."ownerCompanyId"')).toEqual(["CrmRecord"]);
      expect(scope('SELECT 1 FROM "SearchCatalogEntry" e WHERE e."contentHash" = ${hash}')).toEqual(["SearchCatalogEntry"]);
      expect(scope('INSERT INTO "CrmRecord" ("id", "typeId") VALUES (${id}, ${typeId})')).toEqual(["CrmRecord"]);
      expect(scope('DELETE FROM "workflow"."workflow_runs" WHERE "id" = ANY(${ids})')).toEqual(["workflow.workflow_runs"]);
    });

    it("lets a scoped helper cover only its own model", () => {
      expect(scope('SELECT 1 FROM "SearchCatalogEntry" e WHERE ${scopeFilter(scope)}', ["SearchCatalogEntry"])).toEqual([]);
      expect(
        scope('SELECT 1 FROM "SearchCatalogEntry" e JOIN "CrmRecord" r ON r."id" = e."targetId" WHERE ${scopeFilter(s)}', [
          "SearchCatalogEntry",
        ]),
      ).toEqual(["CrmRecord"]);
    });

    it("rejects a tenant query appended inside an allowlisted method", () => {
      const site = "ee/operator/prisma-operator.repository.ts:PrismaOperatorRepo.listWorkspaceTagsUnscoped";
      const allowlist = { [allowlistKey(site, ["Company"])]: "Operator console lists the distinct workspace tags" };
      const allowed = { site, line: 1, evidence: "", tables: ["Company"] };
      expect(allowlistFindings([allowed], allowlist)).toEqual({ offenders: [], stale: [] });
      const appended = { site, line: 2, evidence: "", tables: ["CrmRecord"] };
      expect(allowlistFindings([allowed, appended], allowlist).offenders).toEqual([
        `${site} (line 1) leaves Company unscoped`,
        `${site} (line 2) leaves CrmRecord unscoped`,
      ]);
    });
  });
});

describe("exception membership against the review base", () => {
  it("adds no exception members beyond the review base and the reviewed additions", () => {
    expect(unreviewedExceptionAdditions("raw-sql-tenancy.test.ts")).toEqual([]);
  });
});
