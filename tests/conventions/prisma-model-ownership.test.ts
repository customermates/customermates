import { readFileSync } from "node:fs";
import { join, relative, sep } from "node:path";

import ts from "typescript";
import { describe, expect, it } from "vitest";

import { REPO_ROOT, REPO_SCAN_TIMEOUT_MS, parseSource, readSourceText, walkFiles } from "./walk";
import { unreviewedExceptionAdditions } from "./exception-membership";

const SCANNED = ["app", "core", "ee", "features", "prisma", "workflows"];
const EXCLUDED = [join("prisma", "migrations"), join("prisma", "seeds")];
const WRITE_METHODS = new Set([
  "create",
  "createMany",
  "createManyAndReturn",
  "update",
  "updateMany",
  "updateManyAndReturn",
  "upsert",
  "delete",
  "deleteMany",
]);
const RAW_METHODS = new Set(["$queryRaw", "$executeRaw", "$queryRawUnsafe", "$executeRawUnsafe"]);
const RAW_WRITE = /\b(INSERT\s+INTO|UPDATE|DELETE\s+FROM)\s+"(\w+)"/gi;

const OWNERS: Record<string, string> = {
  AccountActivity: "ee/messaging/persistence/prisma-connected-account.repository.ts",
  AdAttribution: "features/user/prisma-user.repository.ts",
  AgentApproval: "ee/agent-chat/prisma-agent-chat.repository.ts",
  AgentConversation: "ee/agent-chat/prisma-agent-chat.repository.ts",
  AgentCreditAdjustment: "ee/operator/prisma-operator.repository.ts",
  AgentMessage: "ee/agent-chat/prisma-agent-chat.repository.ts",
  AgentRunLease: "ee/agent-chat/prisma-agent-chat.repository.ts",
  AgentRunRound: "ee/agent-chat/prisma-agent-chat.repository.ts",
  AgentToolReceipt: "ee/agent-chat/prisma-agent-chat.repository.ts",
  AgentTurnRequest: "ee/agent-chat/prisma-agent-chat.repository.ts",
  AgentUiCommandResult: "ee/agent-chat/prisma-agent-chat.repository.ts",
  AgentUsageEvent: "ee/agent-chat/prisma-agent-chat.repository.ts",
  Apikey: "core/auth/better-auth.ts",
  AuthAccount: "core/auth/better-auth.ts",
  AuthSession: "core/auth/better-auth.ts",
  AuthUser: "features/user/prisma-user.repository.ts",
  AuthVerification: "features/auth/auth.service.ts",
  Calendar: "ee/calendar/prisma-calendar.repository.ts",
  CalendarEvent: "ee/calendar/prisma-calendar.repository.ts",
  Company: "features/company/prisma-company.repository.ts",
  ConnectedAccount: "ee/messaging/persistence/prisma-connected-account.repository.ts",
  ConversionEvent: "features/company/prisma-company.repository.ts",
  CrmRecord: "features/records/prisma-record.repository.ts",
  DataView: "features/data-view/prisma-data-view.repository.ts",
  DocsChunk: "features/mcp-tools/prisma-docs-chunk.repository.ts",
  EventLog: "features/event/prisma-event-log.repository.ts",
  HostedAiPlatformReservation: "ee/agent-chat/prisma-agent-chat.repository.ts",
  HostedAiPlatformUsage: "ee/agent-chat/prisma-agent-chat.repository.ts",
  InviteToken: "features/company/prisma-company.repository.ts",
  MessagingInboundEvent: "ee/messaging/persistence/prisma-unipile-webhook.repository.ts",
  MessagingMessage: "ee/messaging/persistence/prisma-messaging.repository.ts",
  MessagingThread: "ee/messaging/persistence/prisma-messaging.repository.ts",
  MessagingThreadParticipant: "ee/messaging/persistence/prisma-messaging.repository.ts",
  MessagingThreadRecordLink: "ee/messaging/thread-records/prisma-thread-records.repository.ts",
  OauthAccessToken: "core/auth/better-auth.ts",
  OauthConsent: "features/auth/auth.service.ts",
  OperatorAuditEvent: "ee/operator/prisma-operator.repository.ts",
  P13n: "features/p13n/prisma-p13n.repository.ts",
  RecordAssignment: "features/records/prisma-record.repository.ts",
  RecordEventMatch: "features/records/prisma-record.repository.ts",
  RecordEventSubscription: "features/records/prisma-record-event-subscription.repository.ts",
  RecordFieldDefinition: "features/records/prisma-record.repository.ts",
  RecordFile: "features/records/prisma-record-file.repository.ts",
  RecordFileContent: "core/storage/prisma-file-content.repository.ts",
  RecordIdentity: "features/records/prisma-record.repository.ts",
  RecordIdentityKey: "features/records/prisma-record.repository.ts",
  RecordIdentityLink: "features/records/prisma-record.repository.ts",
  RecordLink: "features/records/prisma-record.repository.ts",
  RecordMutationReceipt: "features/records/prisma-record.repository.ts",
  RecordOperation: "features/records/prisma-record.repository.ts",
  RecordRelationshipDefinition: "features/records/prisma-record.repository.ts",
  RecordSchemaRevision: "features/records/prisma-record.repository.ts",
  RecordSchemaState: "features/records/prisma-record.repository.ts",
  RecordStageRow: "features/records/prisma-record.repository.ts",
  RecordTypeDefinition: "features/records/prisma-record.repository.ts",
  RecordTypeGrant: "features/records/prisma-record.repository.ts",
  RecordValue: "features/records/prisma-record.repository.ts",
  RecordValueDependency: "features/records/prisma-record.repository.ts",
  RolePermission: "features/role/prisma-role.repository.ts",
  Routine: "ee/routines/prisma-routine.repository.ts",
  RoutineRun: "ee/routines/prisma-routine.repository.ts",
  SearchCatalogEntry: "features/command-palette/prisma-search-catalog.repository.ts",
  Subscription: "features/company/prisma-company.repository.ts",
  TrashItem: "features/trash/prisma-trash.repository.ts",
  User: "features/user/prisma-user.repository.ts",
  UserRole: "features/role/prisma-role.repository.ts",
  Webhook: "features/webhook/prisma-webhook.repository.ts",
  WebhookDelivery: "features/webhook/prisma-webhook-delivery.repository.ts",
  Widget: "features/widget/prisma-widget.repository.ts",
  WikiPage: "features/wiki/prisma-wiki-page.repository.ts",
  WikiPageChunk: "features/wiki/prisma-wiki-page.repository.ts",
  WikiSourceDocument: "ee/wiki-crawl/prisma-wiki-website-crawl.repository.ts",
  WikiWebsiteCrawl: "ee/wiki-crawl/prisma-wiki-website-crawl.repository.ts",
};

const ALLOWLIST: Record<string, string> = {};
const ALLOWLIST_CEILING = 0;

type WriteSite = { model: string; file: string; line: number; operation: string };

function sourceFiles() {
  return SCANNED.flatMap((dir) =>
    walkFiles(join(REPO_ROOT, dir), (path) => {
      const file = relative(REPO_ROOT, path);
      if (!/\.tsx?$/.test(file) || /\.test\.tsx?$/.test(file) || file.split(sep).includes("__tests__")) return false;
      return !EXCLUDED.some((excluded) => file.startsWith(excluded + sep));
    }),
  );
}

function models() {
  const schema = readFileSync(join(REPO_ROOT, "prisma", "schema.prisma"), "utf8");
  return [...schema.matchAll(/^model (\w+)/gm)].map((match) => match[1]);
}

function writeSites(): WriteSite[] {
  const names = models();
  const delegates = new Map(names.map((model) => [model[0].toLowerCase() + model.slice(1), model]));
  const tables = new Set(names);
  const sites: WriteSite[] = [];
  for (const path of sourceFiles()) {
    const file = relative(REPO_ROOT, path).split(sep).join("/");
    const source = parseSource(path, readSourceText(path));
    const lineOf = (node: ts.Node) => source.getLineAndCharacterOfPosition(node.getStart()).line + 1;
    const visit = (node: ts.Node) => {
      if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)) {
        const operation = node.expression.name.text;
        const target = node.expression.expression;
        const model = ts.isPropertyAccessExpression(target) ? delegates.get(target.name.text) : undefined;
        if (model && WRITE_METHODS.has(operation)) sites.push({ model, file, line: lineOf(node), operation });
      }
      const callee = ts.isCallExpression(node)
        ? node.expression
        : ts.isTaggedTemplateExpression(node)
          ? node.tag
          : undefined;
      if (callee && ts.isPropertyAccessExpression(callee) && RAW_METHODS.has(callee.name.text)) {
        for (const match of node.getText().matchAll(RAW_WRITE))
          if (tables.has(match[2]))
            sites.push({ model: match[2], file, line: lineOf(node), operation: `raw ${match[1].toUpperCase()}` });
      }
      ts.forEachChild(node, visit);
    };
    visit(source);
  }
  return sites;
}

describe("Prisma model ownership", () => {
  it(
    "writes each model only from its owning repository unless an allowlisted exception says why",
    () => {
      const sites = writeSites();
      const unowned = [...new Set(sites.filter((site) => !OWNERS[site.model]).map((site) => site.model))];
      expect(unowned, "Name the owning repository of every written model in OWNERS").toEqual([]);

      const foreign = sites
        .filter((site) => OWNERS[site.model] !== site.file && !(`${site.model} ${site.file}` in ALLOWLIST))
        .map((site) => `${site.file}:${site.line} ${site.operation} ${site.model} (owner ${OWNERS[site.model]})`);
      expect(foreign, "Move the write into the owning repository and inject it through its port").toEqual([]);

      const used = new Set(sites.map((site) => `${site.model} ${site.file}`));
      const stale = Object.keys(ALLOWLIST).filter((entry) => !used.has(entry));
      expect(stale, "The allowlist only shrinks: remove entries whose write moved to the owner").toEqual([]);
      expect(Object.keys(ALLOWLIST).length, "The allowlist only shrinks: lower the ceiling with it").toBeLessThanOrEqual(
        ALLOWLIST_CEILING,
      );
      for (const [entry, reason] of Object.entries(ALLOWLIST)) expect(reason.length, entry).toBeGreaterThan(40);

      const known = new Set(models());
      const unknown = Object.keys(OWNERS).filter((model) => !known.has(model));
      expect(unknown, "OWNERS names a model that no longer exists").toEqual([]);
    },
    REPO_SCAN_TIMEOUT_MS,
  );

  it("sees the expected write surface", () => {
    const sites = writeSites();
    expect(sites.length).toBeGreaterThan(200);
    expect(sites.some((site) => site.operation.startsWith("raw "))).toBe(true);
    expect(sites.some((site) => site.model === "Widget" && site.file === OWNERS.Widget)).toBe(true);
  });
});

describe("exception membership against the review base", () => {
  it("adds no exception members beyond the review base and the reviewed additions", () => {
    expect(unreviewedExceptionAdditions("prisma-model-ownership.test.ts")).toEqual([]);
  });
});
