import { describe, expect, it, vi } from "vitest";
import { z } from "zod";

import { createAgentToolInputResolver, type AgentToolInputResult } from "../agent-tool-input";

describe("durable agent tool input snapshots", () => {
  it("normalizes once across approval, execution, and concurrent consumers", async () => {
    const schema = z.object({ name: z.string().transform((name) => `${name}!`), page: z.coerce.number().default(1) });
    const normalize = vi.fn(
      async (_name: string, input: unknown): Promise<AgentToolInputResult> => ({
        ok: true,
        input: await schema.parseAsync(input),
      }),
    );
    const resolve = createAgentToolInputResolver(normalize);
    const input = { name: "Ada" };

    const results = await Promise.all([
      resolve("lookup", "call-1", input),
      resolve("lookup", "call-1", input),
      resolve("lookup", "call-1", { name: "Ada" }),
    ]);

    expect(results).toEqual(Array.from({ length: 3 }, () => ({ ok: true, input: { name: "Ada!", page: 1 } })));
    expect(normalize).toHaveBeenCalledTimes(1);
    expect(input).toEqual({ name: "Ada" });
  });

  it.each([
    ["lookup", { page: 2 }],
    ["delete_records", { page: 1 }],
  ])("rejects conflicting reuse for %s and invalidates the original snapshot", async (toolName, input) => {
    const normalize = vi.fn(
      (_name: string, value: unknown): Promise<AgentToolInputResult> =>
        Promise.resolve({
          ok: true,
          input: value,
        }),
    );
    const resolve = createAgentToolInputResolver(normalize);

    await expect(resolve("lookup", "same-call", { page: 1 })).resolves.toMatchObject({ ok: true });
    await expect(resolve(toolName, "same-call", input)).resolves.toMatchObject({ ok: false });
    await expect(resolve("lookup", "same-call", { page: 1 })).resolves.toMatchObject({ ok: false });
    expect(normalize).toHaveBeenCalledTimes(1);
  });

  it("rejects both concurrent consumers when input identity conflicts before parsing completes", async () => {
    let finish!: (result: AgentToolInputResult) => void;
    const resolve = createAgentToolInputResolver(
      () =>
        new Promise<AgentToolInputResult>((complete) => {
          finish = complete;
        }),
    );
    const first = resolve("lookup", "same-call", { page: 1 });
    const second = resolve("lookup", "same-call", { page: 2 });
    finish({ ok: true, input: { page: 1 } });

    await expect(first).resolves.toMatchObject({ ok: false });
    await expect(second).resolves.toMatchObject({ ok: false });
  });

  it("keeps failures stable without reparsing or exposing a value", async () => {
    const normalize = vi.fn(
      (): Promise<AgentToolInputResult> => Promise.resolve({ ok: false, result: "Invalid input." }),
    );
    const resolve = createAgentToolInputResolver(normalize);

    await expect(resolve("lookup", "call-1", {})).resolves.toEqual({ ok: false, result: "Invalid input." });
    await expect(resolve("lookup", "call-1", {})).resolves.toEqual({ ok: false, result: "Invalid input." });
    expect(normalize).toHaveBeenCalledTimes(1);
  });

  it("does not share snapshots across calls or turns", async () => {
    const normalize = vi.fn(
      (_name: string, input: unknown): Promise<AgentToolInputResult> => Promise.resolve({ ok: true, input }),
    );
    const firstTurn = createAgentToolInputResolver(normalize);
    const nextTurn = createAgentToolInputResolver(normalize);

    await firstTurn("lookup", "call-1", {});
    await firstTurn("lookup", "call-2", {});
    await nextTurn("lookup", "call-1", {});
    expect(normalize).toHaveBeenCalledTimes(3);
  });
});
