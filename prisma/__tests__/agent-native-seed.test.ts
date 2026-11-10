import { describe, expect, it } from "vitest";

import { PLAN_CATALOG } from "@/core/commercial/plan-catalog";
import type { SolutionId } from "@/core/solutions/solution-catalog";

import { AGENT_KEY_NAMES, agentApiKeys } from "../seeds/solutions/agent-native";
import type { MessagingProvider, SolutionContent } from "../seeds/solutions/define-solution";
import { inboxThreads } from "../seeds/solutions/inbox-threads";
import { SOLUTION_SUBSCRIPTION } from "../seeds/solutions/seed-solution";
import { solutionWorkspacePlans } from "../seeds/solutions/seed-solutions";

const ACCOUNTS: Record<SolutionId, readonly MessagingProvider[]> = {
  smb: ["google", "outlook", "linkedin", "whatsapp", "instagram", "telegram"],
  consultants: ["google", "outlook", "linkedin"],
  agencies: ["google", "outlook", "linkedin"],
  freelancers: ["google", "linkedin", "whatsapp"],
  startups: ["google", "linkedin"],
  "client-management": ["google", "linkedin", "whatsapp"],
  "sales-pipeline": ["google", "outlook", "linkedin"],
  "linkedin-crm": ["linkedin", "google"],
  "whatsapp-crm": ["whatsapp", "google", "instagram", "linkedin"],
};

const AGENT_NOTE = /\b(?:by|von) (Claude|ChatGPT|Codex)\b/;

const plans = solutionWorkspacePlans();

function inbox(content: SolutionContent) {
  const threads = content.messaging?.threads ?? [];
  const last = (thread: (typeof threads)[number]) => thread.messages.at(-1);
  return {
    threads,
    messages: threads.reduce((count, thread) => count + thread.messages.length, 0),
    unread: threads.filter((thread) => thread.state === "unread").length,
    waiting: threads.filter((thread) => thread.state === "open" && last(thread)?.from !== "self").length,
    drafts: threads.filter((thread) => last(thread)?.draft === true).length,
  };
}

function agentNotes(content: SolutionContent): string[] {
  return Object.values(content.records)
    .flat()
    .flatMap((record) => {
      const notes = record.values.notes;
      const text = Array.isArray(notes) ? notes.join("\n") : typeof notes === "string" ? notes : "";
      return AGENT_NOTE.exec(text)?.slice(1) ?? [];
    });
}

describe("agent-native demo workspaces", () => {
  it.each(plans.map(({ workspace, content }) => [workspace.slug, workspace, content] as const))(
    "%s has a full unified inbox on the channels that fit its business",
    (_slug, workspace, content) => {
      const { threads, messages, unread, waiting, drafts } = inbox(content);
      const accounts = content.messaging?.accounts ?? [];
      expect([...accounts].sort()).toEqual([...ACCOUNTS[workspace.solution.id]].sort());
      for (const account of accounts)
        expect(threads.filter((thread) => thread.account === account).length, account).toBeGreaterThanOrEqual(2);
      expect(threads.length).toBeGreaterThanOrEqual(14);
      expect(threads.length).toBeLessThanOrEqual(18);
      expect(messages).toBeGreaterThanOrEqual(50);
      expect(messages).toBeLessThanOrEqual(80);
      expect(unread).toBeGreaterThanOrEqual(3);
      expect(waiting).toBeGreaterThanOrEqual(3);
      expect(drafts).toBeGreaterThanOrEqual(3);
      expect(threads.every((thread) => thread.account !== "google" || thread.subject)).toBe(true);
    },
  );

  it.each(plans.map(({ workspace, content }) => [workspace.slug, content] as const))(
    "%s shows that Claude, ChatGPT and Codex can create, update and automate",
    (_slug, content) => {
      expect((content.apiKeys ?? []).map((key) => key.name)).toEqual([...AGENT_KEY_NAMES]);
      expect(new Set((content.apiKeys ?? []).map((key) => key.createdDaysAgo)).size).toBe(AGENT_KEY_NAMES.length);
      expect(new Set(agentNotes(content))).toEqual(new Set(["Claude", "ChatGPT", "Codex"]));
      expect(content.wiki.at(-1)).toMatchObject({ key: "agents", kind: "knowledge" });
      expect(content.wiki.at(-1)?.markdown.join("\n")).toMatch(/Mate/);
      expect((content.mateChats ?? []).length).toBeGreaterThanOrEqual(2);
      const owners = (content.routines ?? [])
        .filter((routine) => routine.enabled !== false)
        .map((routine) => routine.owner ?? "maxBergmann");
      const allowance = PLAN_CATALOG[SOLUTION_SUBSCRIPTION.plan].entitlements.includedRoutinesPerUser;
      for (const owner of new Set(owners))
        expect(owners.filter((entry) => entry === owner).length, owner).toBeLessThanOrEqual(Number(allowance));
    },
  );

  it("names no em dash anywhere in the seeded content", () => {
    for (const { workspace, content } of plans) expect(JSON.stringify(content), workspace.slug).not.toContain("—");
  });

  it("builds conversations from a plan and its text, and rejects a text that does not fit", () => {
    const plan = {
      key: "thread",
      account: "google",
      with: ["a"],
      state: "open",
      latestMinutesAgo: 10,
      speakers: ["a", "self"],
      draft: true,
      links: ["deal:x"],
    } as const;
    expect(inboxThreads([plan], { thread: { subject: "Subject", messages: ["Hi", "Hello"] } })).toEqual([
      {
        account: "google",
        with: ["a"],
        subject: "Subject",
        state: "open",
        latestMinutesAgo: 10,
        messages: [
          { from: "a", text: "Hi" },
          { from: "self", text: "Hello", draft: true },
        ],
        links: ["deal:x"],
      },
    ]);
    expect(() => inboxThreads([plan], { thread: { subject: "Subject", messages: ["Hi"] } })).toThrow("needs 2");
    expect(() => inboxThreads([plan], { thread: { messages: ["Hi", "Hello"] } })).toThrow("subject");
    expect(() =>
      inboxThreads([{ ...plan, speakers: ["self", "a"] }], { thread: { subject: "S", messages: ["a", "b"] } }),
    ).toThrow("draft");
  });

  it("names the three agent clients on every key list", () => {
    expect(agentApiKeys([3, 2, 1])).toEqual([
      { name: "Claude Desktop", createdDaysAgo: 3 },
      { name: "ChatGPT", createdDaysAgo: 2 },
      { name: "Codex CLI", createdDaysAgo: 1 },
    ]);
  });
});
