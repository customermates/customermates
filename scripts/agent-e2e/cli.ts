import type { ChildProcess } from "node:child_process";
import { mkdir, rm } from "node:fs/promises";

import type { PrismaClient } from "@/generated/prisma";
import type { AgentE2eCase, CaseVerdict } from "./cases";
import type { AgentE2eFlags } from "./env";
import type { Fixture } from "./fixture";
import type { CaseRow } from "./report";
import type { ApprovalResponder } from "./turn";

import { AGENT_E2E_CASES } from "./cases";
import { requireAgentE2eEnvironment, serverEnvironment } from "./env";
import { seedAgentE2eFixture } from "./fixture";
import { admitsNextCase, microcentsToUsd, renderSummary, renderTable, usdToMicrocents } from "./report";
import { runBuild, SERVER_LOG, startServer, stopServer } from "./server";
import { runCaseTurn } from "./turn";

const SETTLE_TIMEOUT_MS = 60_000;
const RESPOND_RETRY_DELAYS_MS = [0, 500, 1_500, 4_000] as const;

type Environment = Record<string, string | undefined>;

const delay = (ms: number) => new Promise((resolveDelay) => setTimeout(resolveDelay, ms));

async function createClient(databaseUrl: string): Promise<PrismaClient> {
  const [{ PrismaPg }, { PrismaClient: Client }] = await Promise.all([
    import("@prisma/adapter-pg"),
    import("@/generated/prisma"),
  ]);
  return new Client({ adapter: new PrismaPg({ connectionString: databaseUrl }) });
}

async function hostedSpendCommitmentMicrocents(prisma: PrismaClient, now: Date) {
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const [settled, reserved, platform, platformReserved] = await Promise.all([
    prisma.agentUsageEvent.aggregate({
      where: { state: "settled", settledAt: { gte: monthStart } },
      _sum: { costMicrocents: true },
    }),
    prisma.agentUsageEvent.aggregate({
      where: { state: { in: ["reserved", "retained"] } },
      _sum: { reservedMicrocents: true },
    }),
    prisma.hostedAiPlatformUsage.aggregate({ where: { accrualMonth: monthStart }, _sum: { costMicrocents: true } }),
    prisma.hostedAiPlatformReservation.aggregate({ _sum: { reservedMicrocents: true } }),
  ]);
  return (
    (settled._sum.costMicrocents ?? 0n) +
    (reserved._sum.reservedMicrocents ?? 0n) +
    (platform._sum.costMicrocents ?? 0n) +
    BigInt(platformReserved._sum.reservedMicrocents ?? 0)
  );
}

async function companySpendMicrocents(prisma: PrismaClient, companyId: string) {
  const events = await prisma.agentUsageEvent.findMany({
    where: { companyId },
    select: { state: true, costMicrocents: true, reservedMicrocents: true },
  });
  return events.reduce(
    (sum, event) =>
      sum + Number(event.state === "reserved" || event.state === "retained" ? event.reservedMicrocents : event.costMicrocents),
    0,
  );
}

async function waitForSettlement(prisma: PrismaClient, companyId: string) {
  const deadline = Date.now() + SETTLE_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const open = await prisma.agentUsageEvent.count({ where: { companyId, state: { in: ["reserved", "retained"] } } });
    if (!open) return true;
    await delay(1_000);
  }
  return false;
}

function approvalResponder(fixture: Fixture): ApprovalResponder {
  return async (conversationId, requestId, decision) => {
    const { respondToApprovalAs } = await import("@/tests/helpers/agent-e2e-responder");
    for (const wait of RESPOND_RETRY_DELAYS_MS) {
      if (wait) await delay(wait);
      const result = await respondToApprovalAs(
        { companyId: fixture.companyId, userId: fixture.userId },
        { conversationId, requestId, decision },
      );
      if (!result.ok) throw new Error(`approval response failed: ${JSON.stringify(result.error)}`);
      if (result.data.resumed) return;
    }
    throw new Error(`approval ${requestId} did not resume its workflow hook`);
  };
}

async function runCase(args: {
  appUrl: string;
  prisma: PrismaClient;
  fixture: Fixture;
  testCase: AgentE2eCase;
}): Promise<CaseRow> {
  const before = await companySpendMicrocents(args.prisma, args.fixture.companyId);
  const turn = await runCaseTurn({ ...args, respond: approvalResponder(args.fixture) });
  const accepted = args.testCase.acceptedTerminalCodes ?? ["completed"];
  let verdict: CaseVerdict;
  if (turn.error) verdict = { pass: false, reason: turn.error };
  else if (!turn.observation.terminalCode || !accepted.includes(turn.observation.terminalCode))
    verdict = { pass: false, reason: `turn ended ${turn.observation.terminalCode ?? "without a terminal code"}` };
  else
    verdict = await args.testCase
      .check(turn.observation, { prisma: args.prisma, fixture: args.fixture })
      .catch((error: unknown) => ({ pass: false, reason: `check threw: ${String(error)}` }));
  const settled = await waitForSettlement(args.prisma, args.fixture.companyId);
  const cost = (await companySpendMicrocents(args.prisma, args.fixture.companyId)) - before;
  return {
    id: args.testCase.id,
    pass: verdict.pass && settled,
    reason: settled ? verdict.reason : `${verdict.reason}; usage did not settle`,
    costMicrocents: cost,
    rounds: turn.rounds,
    firstOutputMs: turn.timing.firstOutputMs,
    firstTextMs: turn.timing.firstTextMs,
    totalMs: turn.totalMs,
  };
}

export async function runAgentE2e(flags: AgentE2eFlags, launchEnvironment: Environment): Promise<number> {
  const environment = requireAgentE2eEnvironment(flags, launchEnvironment);
  const cases = flags.cases ? AGENT_E2E_CASES.filter((entry) => flags.cases?.includes(entry.id)) : AGENT_E2E_CASES;
  if (flags.cases && cases.length !== flags.cases.length)
    throw new Error(`Unknown case id. Known: ${AGENT_E2E_CASES.map((entry) => entry.id).join(", ")}`);
  const capMicrocents = usdToMicrocents(flags.capUsd);
  const prisma = await createClient(environment.databaseUrl);
  let server: ChildProcess | null = null;
  try {
    if (flags.build) await runBuild({ ...launchEnvironment, NEXT_PUBLIC_SENTRY_DSN: "" });
    await rm(environment.workflowDataDir, { recursive: true, force: true });
    await mkdir(environment.workflowDataDir, { recursive: true });
    const monthlyCap = (await hostedSpendCommitmentMicrocents(prisma, new Date())) + BigInt(capMicrocents);
    const fixture = await seedAgentE2eFixture(prisma, {
      creditsPerUser: Math.ceil(flags.capUsd * 100),
      authSecret: launchEnvironment.BETTER_AUTH_SECRET ?? "",
    });
    console.log(`agent:e2e: workspace ${fixture.companyId}, ${cases.length} cases, cap US$${flags.capUsd.toFixed(2)}`);
    server = await startServer({
      port: flags.port,
      appUrl: environment.appUrl,
      environment: serverEnvironment({
        appUrl: environment.appUrl,
        port: flags.port,
        workflowDataDir: environment.workflowDataDir,
        monthlySpendCapMicrocents: monthlyCap,
        environment: launchEnvironment,
      }),
    });

    const rows: CaseRow[] = [];
    const skipped: string[] = [];
    for (const testCase of cases) {
      const spent = await companySpendMicrocents(prisma, fixture.companyId);
      if (!admitsNextCase(spent, capMicrocents, rows)) {
        skipped.push(testCase.id);
        continue;
      }
      const row = await runCase({ appUrl: environment.appUrl, prisma, fixture, testCase });
      rows.push(row);
      console.log(`${row.pass ? "pass" : "FAIL"} ${row.id}: ${row.reason} (US$${microcentsToUsd(row.costMicrocents).toFixed(4)})`);
    }
    const total = await companySpendMicrocents(prisma, fixture.companyId);
    console.log("");
    console.log(renderTable(rows));
    console.log(renderSummary(rows, total, skipped));
    const failed = rows.some((row) => !row.pass) || skipped.length > 0;
    if (failed) console.log(`server log: ${SERVER_LOG}`);
    return failed ? 1 : 0;
  } finally {
    if (server) await stopServer(server);
    await prisma.$disconnect();
  }
}
