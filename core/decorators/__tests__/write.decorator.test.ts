import { beforeEach, describe, it, expect, vi } from "vitest";
import { z } from "zod";

import { Write } from "../write.decorator";

const transactionMock = vi.hoisted(() => ({
  run: vi.fn((fn: () => Promise<unknown>) => fn()),
}));

vi.mock("../transaction-runner", () => ({
  runInTransaction: (fn: () => Promise<unknown>) => transactionMock.run(fn),
}));

vi.mock("@/core/validation/zod-error-map-server", () => ({
  getZodParseContext: vi.fn().mockResolvedValue(undefined),
}));

type Result = { ok: true; data: { n: number } } | { ok: false; error: z.ZodError };

function buildInteractor(options: { failPrecheck?: boolean; invalidOutput?: boolean; transaction?: boolean }) {
  const order: string[] = [];

  const input = z.object({ n: z.number() }).superRefine(() => {
    order.push("parse");
  });
  const output = z.object({ n: z.any() }).superRefine((value, ctx) => {
    order.push("output");
    if (typeof value.n !== "number") ctx.addIssue({ code: "custom", message: "invalid output", path: ["n"] });
  });

  class TestInteractor {
    invoke(data: { n: number }): Promise<Result> {
      order.push("body");
      return Promise.resolve({
        ok: true,
        data: { n: options.invalidOutput ? ("invalid" as never) : data.n },
      });
    }

    precheck(_data: { n: number }, ctx: z.RefinementCtx) {
      order.push("precheck");
      if (options.failPrecheck) {
        ctx.addIssue({
          code: "custom",
          message: "precheck failed",
          path: ["n"],
        });
      }
    }
  }

  const descriptor = Object.getOwnPropertyDescriptor(TestInteractor.prototype, "invoke") as PropertyDescriptor;
  Write({
    input,
    output,
    precheck: (self: any, data, ctx) => self.precheck(data, ctx),
    tx: options.transaction ? {} : false,
  })(TestInteractor.prototype, "invoke", descriptor);
  Object.defineProperty(TestInteractor.prototype, "invoke", descriptor);

  return {
    interactor: new TestInteractor() as {
      invoke: (data: unknown) => Promise<Result>;
    },
    order,
  };
}

describe("@Write", () => {
  beforeEach(() => {
    transactionMock.run.mockReset();
    transactionMock.run.mockImplementation((fn) => fn());
  });
  it("runs parse, then precheck, then the body, then output validation", async () => {
    const { interactor, order } = buildInteractor({});

    const result = await interactor.invoke({ n: 5 });

    expect(result.ok).toBe(true);
    expect(order).toEqual(["parse", "precheck", "body", "output"]);
  });

  it("short-circuits on a precheck issue before the body runs", async () => {
    const { interactor, order } = buildInteractor({ failPrecheck: true });

    const result = await interactor.invoke({ n: 5 });

    expect(result.ok).toBe(false);
    expect(order).toEqual(["parse", "precheck"]);
  });

  it("short-circuits on a parse issue before precheck and the body run", async () => {
    const { interactor, order } = buildInteractor({});

    const result = await interactor.invoke({ n: "not a number" });

    expect(result.ok).toBe(false);
    expect(order).not.toContain("precheck");
    expect(order).not.toContain("body");
  });

  it("validates output before the transaction can commit", async () => {
    const { interactor, order } = buildInteractor({ transaction: true });
    transactionMock.run.mockImplementationOnce(async (fn) => {
      order.push("tx-start");
      const result = await fn();
      order.push("tx-end");
      return result;
    });

    await expect(interactor.invoke({ n: 5 })).resolves.toEqual({
      ok: true,
      data: { n: 5 },
    });
    expect(order).toEqual(["parse", "precheck", "tx-start", "body", "output", "tx-end"]);
  });

  it("rejects an invalid output inside the transaction boundary", async () => {
    const { interactor, order } = buildInteractor({
      invalidOutput: true,
      transaction: true,
    });
    transactionMock.run.mockImplementationOnce(async (fn) => {
      order.push("tx-start");
      const result = await fn();
      order.push("tx-end");
      return result;
    });

    await expect(interactor.invoke({ n: 5 })).rejects.toBeInstanceOf(z.ZodError);
    expect(order).toEqual(["parse", "precheck", "tx-start", "body", "output"]);
  });
});
