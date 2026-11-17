import type { ToolSet } from "ai";
import type { RecordOperationCause } from "@/features/records/record-event.schema";

import { tool } from "ai";
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";

import { currentCausation, runInCausation } from "@/core/decorators/causation-context";
import { RoutineAdmission } from "@/ee/routines/routine-admission";
import { FakeAutomationRuleRepo } from "@/features/automation-rules/__tests__/fake-automation-rule-repo";
import { AutomationRuleAdmission } from "@/features/automation-rules/automation-rule-admission";
import { extendAutomationChain } from "@/features/automation-rules/automation-context";
import { recordCauseBy } from "@/features/records/record-event-cause";

import { AgentJobRecorder } from "../agent-job-recorder";
import { agentJobCausation, buildAgentJobTools } from "../agent-job-toolset";

const COMPANY = "00000000-0000-4000-8000-000000000011";
const OWNER = "00000000-0000-4000-8000-000000000010";
const RULE_A = "00000000-0000-4000-8000-0000000000a1";
const RULE_B = "00000000-0000-4000-8000-0000000000a2";
const RULE_C = "00000000-0000-4000-8000-0000000000a3";
const TYPE = "11111111-1111-4111-8111-111111111111";
const RECORD = "44444444-4444-4444-8444-444444444444";
const NOW = new Date("2026-11-17T12:00:00.000Z");

type Execute = (input: unknown, options: { toolCallId: string }) => Promise<unknown>;

// What the record engine stamps on the event of a write: it reads the causation the write runs in.
function writeTool(seen: RecordOperationCause[]): ToolSet {
  return {
    mutate_crm_record: tool({
      description: "Write a record",
      inputSchema: z.object({}),
      execute: () => {
        seen.push(recordCauseBy({ via: undefined }, { kind: "mutation" }));
        return Promise.resolve({ ok: true, result: "saved" });
      },
    }),
  };
}

async function causeOfAgentWrite(ruleChain: readonly string[]): Promise<RecordOperationCause> {
  const seen: RecordOperationCause[] = [];
  const tools = buildAgentJobTools({
    locale: "en",
    maxToolCalls: 5,
    recorder: new AgentJobRecorder(() => NOW),
    ruleChain,
    base: writeTool(seen),
  });
  await (tools.mutate_crm_record as unknown as { execute: Execute }).execute({}, { toolCallId: "call-1" });
  return seen[0];
}

function recordUpdated(cause: RecordOperationCause, id = "77777777-7777-4777-8777-000000000001") {
  return {
    id,
    companyId: COMPANY,
    kind: "record.updated",
    subjectKind: "record",
    subjectTypeId: TYPE,
    subjectId: RECORD,
    payload: {
      ref: { typeId: TYPE, recordId: RECORD },
      schemaRevision: 1,
      cause,
      beforeVersion: 1,
      afterVersion: 2,
      changedFieldIds: [],
      fields: [],
      assignments: null,
      identities: null,
      links: [],
    },
  };
}

function ruleWorld(ruleIds: string[]) {
  const repo = new FakeAutomationRuleRepo();
  for (const id of ruleIds) {
    repo.addRule({
      id,
      triggerKind: "recordUpdated",
      typeId: TYPE,
      trigger: { kind: "recordUpdated", typeId: TYPE },
      effects: [{ kind: "agent", runtime: "ownKey", prompt: "Summarise into Notes" }],
    } as never);
  }
  const dispatch = vi.fn().mockResolvedValue(undefined);
  const reader = {
    findEventMatches: vi.fn().mockResolvedValue(
      ruleIds.map((ruleId) => ({
        companyId: COMPANY,
        eventId: "77777777-7777-4777-8777-000000000001",
        subscriptionId: ruleId,
        subscriptionRevision: 1,
        subscription: { id: ruleId, kind: "rule", ownerUserId: OWNER, revision: 1, enabled: true },
      })),
    ),
    readEvent: vi.fn().mockResolvedValue({ event: "record.updated" }),
  };
  const admission = new AutomationRuleAdmission(repo, { dispatch } as never, reader as never, () => NOW);
  const startedRules = () => [...repo.runs.values()].map((run) => run.ruleId).sort();
  return { repo, admission, dispatch, startedRules };
}

describe("record changes made by an agent job", () => {
  it("carry the rule chain of the job and the routine depth, whatever the tool does", async () => {
    expect(await causeOfAgentWrite([RULE_A])).toEqual({ kind: "mutation", ruleChain: [RULE_A], routineDepth: 1 });
    expect(await causeOfAgentWrite([])).toEqual({ kind: "mutation", routineDepth: 1 });
    expect(agentJobCausation([RULE_A, RULE_B])).toEqual({ routineDepth: 1, ruleChain: [RULE_A, RULE_B] });
    expect(currentCausation()).toBeUndefined();
  });

  it("do not start the rule that enqueued the job again, but may start another rule once", async () => {
    // Rule A ran and enqueued the job: the job holds the chain the run executed its effects in.
    const jobChain = extendAutomationChain([], RULE_A);
    const cause = await causeOfAgentWrite(jobChain);
    const { admission, startedRules, repo, dispatch } = ruleWorld([RULE_A, RULE_B]);

    await admission.admit(recordUpdated(cause) as never);

    expect(startedRules()).toEqual([RULE_B]);
    expect([...repo.runs.values()][0]).toMatchObject({ payload: { chain: [RULE_A] }, depth: 1 });
    expect(dispatch).toHaveBeenCalledTimes(1);
  });

  it("without the chain the same rule would start again: the guard only sees what the write carries", async () => {
    const { admission, startedRules } = ruleWorld([RULE_A]);

    await admission.admit(recordUpdated({ kind: "mutation" }) as never);

    expect(startedRules()).toEqual([RULE_A]);
  });

  it("keep the depth limit across an agent hop: a rule started by an agent's change cannot start a third", async () => {
    // Rule A's agent changed a record, rule B ran on that change and enqueued its own agent job.
    const jobChain = extendAutomationChain([RULE_A], RULE_B);
    const cause = await causeOfAgentWrite(jobChain);
    const { admission, startedRules, dispatch } = ruleWorld([RULE_A, RULE_B, RULE_C]);

    await admission.admit(recordUpdated(cause) as never);

    expect(startedRules()).toEqual([]);
    expect(dispatch).not.toHaveBeenCalled();
  });

  it("do not start event routines either", async () => {
    const cause = await causeOfAgentWrite([RULE_A]);
    const routines = {
      findEventRoutinesUnscoped: vi.fn().mockResolvedValue([{ id: "routine-1", ownerUserId: OWNER, updatedAt: NOW }]),
      admitEventRoutineRunsUnscoped: vi.fn().mockResolvedValue([]),
    };
    const reader = { findEventMatches: vi.fn().mockResolvedValue([]), readEvent: vi.fn() };
    const admission = new RoutineAdmission(routines as never, { dispatch: vi.fn() } as never, reader as never);

    await admission.admit(recordUpdated(cause) as never);

    expect(reader.findEventMatches).not.toHaveBeenCalled();
    expect(routines.admitEventRoutineRunsUnscoped).not.toHaveBeenCalled();
  });

  it("leave the causation of the caller untouched outside a tool call", async () => {
    await runInCausation({ ruleChain: [RULE_C] }, async () => {
      expect(await causeOfAgentWrite([RULE_A])).toMatchObject({ ruleChain: [RULE_A] });
      expect(currentCausation()).toEqual({ ruleChain: [RULE_C] });
    });
  });
});
