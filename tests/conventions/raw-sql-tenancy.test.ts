import { join, relative, sep } from "node:path";

import ts from "typescript";
import { describe, expect, it } from "vitest";

import { REPO_ROOT, REPO_SCAN_TIMEOUT_MS, parseSource, readSourceText, walkFiles } from "./walk";

const RAW_METHODS = new Set(["$queryRaw", "$executeRaw", "$queryRawUnsafe", "$executeRawUnsafe"]);
const EXCLUDED = [join("prisma", "migrations"), "scripts", "tests", "generated", "node_modules", ".next", ".runs"];
const TENANT_PREDICATE = /"companyId"\s*(=|IN\b|,)/;
const SCOPED_COMPILERS =
  /\b(compileRecordQuery|compileRecordMeasure|compileRecordGroups|compileRecordSearch|compileRecordSearchPage|compileRecordPathSummaries|compileRecordRelationshipSummaries|recordReadPredicate|fieldReadPredicate)\s*\(/;

const SCOPED_HELPERS: Record<string, RegExp> = {
  "features/trash/prisma-trash.repository.ts": /\bthis\.conditions\(/,
  "ee/messaging/persistence/prisma-messaging.repository.ts": /\bthis\.recordInboxQuery\(/,
  "ee/messaging/activities/prisma-record-activities.repository.ts": /\bcompileRecordActivityIndex\(/,
  "features/command-palette/prisma-search-catalog.repository.ts": /\bscopeFilter\(/,
};

const ALLOWLIST: Record<string, string> = {
  "core/decorators/transaction-runner.ts:runInTransaction":
    "Transaction control: READ ONLY mode and the tenant-keyed advisory lock; no table access",
  "core/decorators/transaction-runner.ts:runInSavepoint":
    "Transaction control: savepoint create, release and rollback; no table access",
  "ee/agent-chat/prisma-agent-chat.repository.ts:PrismaAgentChatRepo.admitsHostedAiGlobalSpend":
    "Platform-wide hosted AI spend admission: a global advisory lock and cross-tenant commitment total",
  "ee/agent-chat/prisma-agent-chat.repository.ts:PrismaAgentChatRepo.releaseStaleRetrievalReservations":
    "Platform-wide hosted AI spend admission: a global advisory lock and cross-tenant commitment total",
  "ee/agent-chat/prisma-agent-chat.repository.ts:PrismaAgentChatRepo.settlePlatformUsageUnscoped":
    "Platform-wide hosted AI spend admission: a global advisory lock and cross-tenant commitment total",
  "ee/agent-chat/prisma-agent-chat.repository.ts:PrismaAgentChatRepo.settleStalePlatformReservationsUnscoped":
    "Platform-wide hosted AI spend admission: a global advisory lock and cross-tenant commitment total",
  "ee/operator/prisma-operator.repository.ts:PrismaOperatorRepo.deleteWorkspaceUnscoped":
    "Operator console workspace deletion: workflow schema probe and run cleanup keyed by the run's companyId input",
  "ee/operator/prisma-operator.repository.ts:PrismaOperatorRepo.getUserSummaryUnscoped":
    "Operator console: cross-tenant user count for the platform summary",
  "ee/operator/prisma-operator.repository.ts:PrismaOperatorRepo.listWorkspaceTagsUnscoped":
    "Operator console: distinct workspace tags across all companies",
  "ee/operator/prisma-operator.repository.ts:PrismaOperatorRepo.lockPlatformOperatorInvariant":
    "Operator console: platform-wide advisory lock guarding the last platform operator",
  "features/command-palette/prisma-search-catalog.repository.ts:PrismaSearchCatalogRepo.replaceWorkspaceCatalog":
    "Transaction control: catalog sync advisory lock keyed by the workspace companyId; its writes use scopeFilter",
  "features/command-palette/prisma-search-catalog.repository.ts:PrismaSearchCatalogRepo.semanticIndexAvailable":
    "information_schema probe for an optional column; reads no tenant rows",
  "features/command-palette/prisma-search-catalog.repository.ts:PrismaSearchCatalogRepo.storedStaticEntries":
    "Static search catalog: rows with companyId IS NULL shared by every workspace",
  "features/command-palette/prisma-search-catalog.repository.ts:PrismaSearchCatalogRepo.writeStaticCatalog":
    "Static search catalog: global sync lock and companyId IS NULL rows shared by every workspace",
  "features/mcp-tools/prisma-docs-chunk.repository.ts:PrismaDocsChunkRepo.pendingEmbeddings":
    "Static product documentation corpus: DocsChunk rows carry no tenant data",
  "features/mcp-tools/prisma-docs-chunk.repository.ts:PrismaDocsChunkRepo.rankedFullTextSections":
    "Static product documentation corpus: DocsChunk rows carry no tenant data",
  "features/mcp-tools/prisma-docs-chunk.repository.ts:PrismaDocsChunkRepo.semanticIndexAvailable":
    "information_schema probe for an optional column; reads no tenant rows",
  "features/mcp-tools/prisma-docs-chunk.repository.ts:PrismaDocsChunkRepo.semanticIndexComplete":
    "Static product documentation corpus: DocsChunk rows carry no tenant data",
  "features/mcp-tools/prisma-docs-chunk.repository.ts:PrismaDocsChunkRepo.semanticSections":
    "Static product documentation corpus: DocsChunk rows carry no tenant data",
  "features/mcp-tools/prisma-docs-chunk.repository.ts:PrismaDocsChunkRepo.storeEmbeddings":
    "Static product documentation corpus: DocsChunk rows carry no tenant data",
  "features/mcp-tools/prisma-docs-chunk.repository.ts:PrismaDocsChunkRepo.typoCorrections":
    "Static product documentation corpus: DocsChunk rows carry no tenant data",
  "features/mcp-tools/prisma-docs-chunk.repository.ts:PrismaDocsChunkRepo.writeCorpus":
    "Static product documentation corpus: DocsChunk rows carry no tenant data",
  "features/records/prisma-record.repository.ts:PrismaRecordRepo.searchRecords":
    "Transaction-local pg_trgm similarity threshold via set_config; no table access",
  "features/user/prisma-user.repository.ts:PrismaUserRepo.findAuthUserCompanyIdForUpdateUnscoped":
    "Locks the AuthUser row to resolve its tenant; AuthUser is not tenant-scoped",
  "features/wiki/prisma-wiki-page.repository.ts:PrismaWikiPageRepo.rankPageSections":
    "Pure full-text ranking over caller-supplied section text; reads no table",
  "features/wiki/prisma-wiki-page.repository.ts:PrismaWikiPageRepo.sectionHeadlines":
    "Pure ts_headline computation over caller-supplied bodies; reads no table",
  "features/wiki/prisma-wiki-page.repository.ts:PrismaWikiPageRepo.semanticIndexAvailable":
    "information_schema probe for an optional column; reads no tenant rows",
  "prisma/seeds/records.ts:calculateSyntheticRecords":
    "Seed transaction control: advisory lock keyed by the seeded companyId",
  "prisma/seeds/records.ts:seedRecordFixtures": "Seed transaction control: advisory lock keyed by the seeded companyId",
  "prisma/seeds/relationships.ts:seedRelationships":
    "Seed transaction control: advisory lock keyed by the seeded companyId",
  "prisma/seeds/run.ts:runSyntheticSeed":
    "Seed scheduler fix-up: resets the global AgentMessage sequence after inserting fixtures",
};
const ALLOWLIST_CEILING = 31;

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

describe("raw SQL tenancy", () => {
  it(
    "scopes every raw statement by companyId or a scoped compiler unless it is an allowlisted system query",
    () => {
      const unscoped = inventory().filter(
        (call) =>
          !TENANT_PREDICATE.test(call.evidence) &&
          !SCOPED_COMPILERS.test(call.evidence) &&
          !SCOPED_HELPERS[call.site.slice(0, call.site.lastIndexOf(":"))]?.test(call.evidence),
      );
      const offenders = [
        ...new Set(
          unscoped
            .filter((call) => !(call.site in ALLOWLIST))
            .map((call) => `${call.site} (line ${call.line}) ${call.evidence.slice(0, 160).replace(/\s+/g, " ")}`),
        ),
      ];
      expect(offenders, "Add a companyId predicate or compose a scoped compiler").toEqual([]);
      const stale = Object.keys(ALLOWLIST).filter((site) => !unscoped.some((call) => call.site === site));
      expect(stale, "The allowlist only shrinks: remove entries whose raw SQL is now scoped or gone").toEqual([]);
      expect(
        Object.keys(ALLOWLIST).length,
        "The allowlist only shrinks: lower the ceiling with it",
      ).toBeLessThanOrEqual(ALLOWLIST_CEILING);
      for (const [site, reason] of Object.entries(ALLOWLIST)) expect(reason.length, site).toBeGreaterThan(20);
    },
    REPO_SCAN_TIMEOUT_MS,
  );
});
