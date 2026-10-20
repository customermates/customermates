import { describe, expect, it } from "vitest";

import { compareWithBaseline, mergeOutcomes, testOutcomes, updateBaseline } from "../lib/e2e-results.mjs";
import { assignShards } from "../lib/vitest-results.mjs";
import { inboxHash, isTestInbox, unipileDecision } from "../../../tests/e2e/live/live-allowlist.mjs";

const report = {
  suites: [
    {
      title: "records.spec.ts",
      file: "records.spec.ts",
      specs: [
        { title: "creates a record", file: "records.spec.ts", line: 4, tests: [{ projectName: "chromium", status: "expected", results: [{ status: "passed", duration: 10 }] }] },
        {
          title: "edits a record",
          file: "records.spec.ts",
          line: 20,
          tests: [{ projectName: "chromium", status: "flaky", results: [{ status: "failed", duration: 5, error: { message: "Timeout\nmore" } }, { status: "passed", duration: 6 }] }],
        },
      ],
      suites: [
        {
          title: "bulk",
          file: "records.spec.ts",
          specs: [
            { title: "deletes", file: "records.spec.ts", line: 40, tests: [{ projectName: "chromium", status: "unexpected", results: [{ status: "failed", error: { message: "\u001b[31mExpected 1\u001b[39m" } }, { status: "failed" }] }] },
            { title: "skipped", file: "records.spec.ts", line: 60, tests: [{ projectName: "chromium", status: "skipped", results: [] }] },
          ],
        },
      ],
    },
  ],
};

describe("Playwright result baseline", () => {
  const outcomes = testOutcomes(report);

  it("identifies tests by file and titles, without line numbers", () => {
    expect(outcomes.map((outcome) => [outcome.id, outcome.status])).toEqual([
      ["records.spec.ts › creates a record", "passed"],
      ["records.spec.ts › edits a record", "flaky"],
      ["records.spec.ts › bulk › deletes", "failed"],
      ["records.spec.ts › bulk › skipped", "skipped"],
    ]);
    expect(outcomes[2].error).toBe("Expected 1");
  });

  it("fails only on failures missing from the baseline and reports flaky and fixed tests", () => {
    const unknown = compareWithBaseline(outcomes, { failing: [], flaky: [] });
    expect(unknown.newFailures.map((outcome) => outcome.id)).toEqual(["records.spec.ts › bulk › deletes"]);
    expect(unknown.flakyTests.map((outcome) => [outcome.id, outcome.known])).toEqual([["records.spec.ts › edits a record", false]]);

    const known = compareWithBaseline(outcomes, { failing: ["records.spec.ts › bulk › deletes", "records.spec.ts › creates a record"], flaky: [] });
    expect(known.newFailures).toEqual([]);
    expect(known.knownFailures).toHaveLength(1);
    expect(known.fixed.map((outcome) => outcome.id)).toEqual(["records.spec.ts › creates a record"]);
  });

  it("keeps the worst outcome of a test seen in several shard reports", () => {
    const merged = mergeOutcomes([outcomes, outcomes.map((outcome) => ({ ...outcome, status: "passed" }))]);
    expect(merged.find((outcome) => outcome.id.endsWith("deletes"))?.status).toBe("failed");
  });

  it("writes failing and flaky tests per target, replacing or extending an entry", () => {
    const first = updateBaseline({ targets: {} }, "cloud-chromium", outcomes);
    expect(first.targets["cloud-chromium"]).toMatchObject({ tests: 4, failing: ["records.spec.ts › bulk › deletes"], flaky: ["records.spec.ts › edits a record"] });
    const replaced = updateBaseline(first, "cloud-chromium", outcomes.slice(0, 1));
    expect(replaced.targets["cloud-chromium"].failing).toEqual([]);
    const union = updateBaseline(first, "cloud-chromium", outcomes.slice(0, 1), { union: true });
    expect(union.targets["cloud-chromium"].failing).toEqual(["records.spec.ts › bulk › deletes"]);
  });
});

describe("Vitest shard assignment", () => {
  it("balances recorded durations and spreads unknown files", () => {
    const shards = assignShards(["a", "b", "c", "d", "e"], 2, { a: 100, b: 60, c: 50, d: 10 });
    const load = (files: string[]) => files.reduce((total, file) => total + ({ a: 100, b: 60, c: 50, d: 10 }[file] ?? 50), 0);
    expect(shards.flat().sort()).toEqual(["a", "b", "c", "d", "e"]);
    expect(Math.abs(load(shards[0]) - load(shards[1]))).toBeLessThanOrEqual(60);
  });
});

describe("live-check egress guard", () => {
  const send = (account: string, to: string[]) => {
    const url = new URL(`https://api.unipile.com/v2/${account}/emails/send`);
    return unipileDecision("POST", url, url.href, { body: JSON.stringify({ to: to.map((identifier) => ({ identifier })) }) });
  };

  it("matches test inboxes by salted hash only", () => {
    expect(inboxHash(" Someone@Example.test ")).toBe(inboxHash("someone@example.test"));
    expect(isTestInbox("someone@example.test")).toBe(false);
  });

  it("refuses sends to other addresses, from other accounts, and every other provider write", async () => {
    expect(await send("acc_01m42y7hj1ecva9pb0sycgqq51", ["someone@example.test"])).toMatchObject({ status: 422 });
    expect(await send("acc_other", ["someone@example.test"])).toMatchObject({ status: 422 });
    expect(await send("acc_01m42y7hj1ecva9pb0sycgqq51", [])).toMatchObject({ status: 422 });
    const remove = new URL("https://api.unipile.com/v2/accounts/acc_01m42y7hj1ecva9pb0sycgqq51");
    expect(await unipileDecision("DELETE", remove, remove.href, {})).toMatchObject({ status: 403 });
    const chat = new URL("https://api.unipile.com/v2/acc_01m42y7hj1ecva9pb0sycgqq51/chats");
    expect(await unipileDecision("POST", chat, chat.href, { body: "{}" })).toMatchObject({ status: 403 });
    expect(await unipileDecision("GET", remove, remove.href, {})).toBeNull();
  });
});
