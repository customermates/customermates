import type { ToolSet } from "ai";

import { tool } from "ai";
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";

import {
  AGENT_JOB_ROUTINE_LOOP_REFUSAL,
  AGENT_JOB_UNTRUSTED_REFUSAL,
  AGENT_JOB_WIKI_REFUSAL,
} from "@/features/agent-jobs/agent-job-tool-policy";

import { AgentJobRecorder } from "../agent-job-recorder";
import { buildAgentJobTools } from "../agent-job-toolset";

const NOW = new Date("2026-11-17T12:00:00.000Z");
const RULE = "00000000-0000-4000-8000-0000000000a1";
const NAMES = [
  "send_email",
  "send_chat_message",
  "manage_webhooks",
  "manage_routines",
  "manage_social_relations",
  "manage_wiki_pages",
  "mutate_crm_record",
] as const;

type Execute = (input: unknown, options: { toolCallId: string }) => Promise<unknown>;

function world(options: { untrusted?: boolean; ruleChain?: string[] }) {
  const ran = vi.fn();
  const base = Object.fromEntries(
    NAMES.map((name) => [
      name,
      tool({
        description: name,
        inputSchema: z.object({}).loose(),
        execute: (input: unknown) => {
          ran(name, input);
          return Promise.resolve({ ok: true, result: "done" });
        },
      }),
    ]),
  ) as ToolSet;
  const recorder = new AgentJobRecorder(() => NOW);
  const tools = buildAgentJobTools({ locale: "en", maxToolCalls: 25, recorder, base, ...options });
  const call = (name: (typeof NAMES)[number], input: unknown = {}) =>
    (tools[name] as unknown as { execute: Execute }).execute(input, { toolCallId: `call-${name}` });
  return { call, ran, recorder };
}

describe("the tools of a hosted agent job", () => {
  it("refuses the tools that act outward or change automation when the job is untrusted, with a text the model reads", async () => {
    const { call, ran, recorder } = world({ untrusted: true });
    const refused = { ok: false, result: AGENT_JOB_UNTRUSTED_REFUSAL };

    expect(await call("send_email", { to: "someone" })).toEqual(refused);
    expect(await call("send_chat_message")).toEqual(refused);
    expect(await call("manage_webhooks", { action: "create" })).toEqual(refused);
    expect(await call("manage_webhooks", { action: "update" })).toEqual(refused);
    expect(await call("manage_routines", { action: "create" })).toEqual(refused);
    expect(await call("manage_routines", { action: "update" })).toEqual(refused);
    expect(await call("manage_routines", { action: "run_now" })).toEqual(refused);
    expect(await call("manage_social_relations", { action: "invite" })).toEqual(refused);
    expect(ran).not.toHaveBeenCalled();

    expect(await call("manage_webhooks", { action: "list" })).toEqual({ ok: true, result: "done" });
    expect(await call("mutate_crm_record", { action: "update" })).toEqual({ ok: true, result: "done" });
    expect(ran.mock.calls.map(([name]) => name)).toEqual(["manage_webhooks", "mutate_crm_record"]);
    expect(recorder.toolCalls).toBe(10);
    const results = recorder.drain().filter((event) => event.type === "toolResult");
    expect(results[0]).toMatchObject({ name: "send_email", ok: false });
    expect(results[0].type === "toolResult" && results[0].summary).toContain("Not available in this run");
  });

  it("lets a trusted job use those tools", async () => {
    const { call, ran } = world({ untrusted: false });

    expect(await call("send_email", { to: "someone" })).toEqual({ ok: true, result: "done" });
    expect(await call("manage_webhooks", { action: "create" })).toEqual({ ok: true, result: "done" });
    expect(await call("manage_social_relations", { action: "invite" })).toEqual({ ok: true, result: "done" });
    expect(ran).toHaveBeenCalledTimes(3);
  });

  it("treats a job as untrusted when nothing says otherwise", async () => {
    const { call, ran } = world({});

    expect(await call("send_email")).toEqual({ ok: false, result: AGENT_JOB_UNTRUSTED_REFUSAL });
    expect(ran).not.toHaveBeenCalled();
  });

  it("does not start a routine or set up one that reacts to events when a rule started the job", async () => {
    const { call, ran } = world({ untrusted: false, ruleChain: [RULE] });
    const refused = { ok: false, result: AGENT_JOB_ROUTINE_LOOP_REFUSAL };

    expect(await call("manage_routines", { action: "run_now", id: "r" })).toEqual(refused);
    expect(await call("manage_routines", { action: "create", triggerKind: "event" })).toEqual(refused);
    expect(await call("manage_routines", { action: "update", id: "r", prompt: "again" })).toEqual(refused);
    expect(ran).not.toHaveBeenCalled();

    const scheduled = { action: "create", triggerKind: "schedule", cronExpression: "0 9 * * 1" };
    expect(await call("manage_routines", scheduled)).toEqual({ ok: true, result: "done" });
    expect(await call("manage_routines", { action: "list" })).toEqual({ ok: true, result: "done" });

    const outsideRule = world({ untrusted: false, ruleChain: [] });
    expect(await outsideRule.call("manage_routines", { action: "run_now", id: "r" })).toEqual({
      ok: true,
      result: "done",
    });
  });

  it("never writes the Knowledge Base, trusted or not", async () => {
    for (const untrusted of [false, true]) {
      const { call, ran } = world({ untrusted, ruleChain: [RULE] });
      for (const action of ["create", "update", "delete"])
        expect(await call("manage_wiki_pages", { action })).toEqual({ ok: false, result: AGENT_JOB_WIKI_REFUSAL });
      expect(await call("manage_wiki_pages", { action: "search" })).toEqual({ ok: true, result: "done" });
      expect(ran).toHaveBeenCalledTimes(1);
    }
  });
});
