import { describe, it, expect, vi } from "vitest";
import { z } from "zod";

import { Write } from "../write.decorator";

vi.mock("@/core/validation/zod-error-map-server", () => ({
  configureZodLocale: vi.fn().mockResolvedValue(undefined),
}));

type Result = { ok: true; data: { n: number } } | { ok: false; error: z.ZodError };

function buildInteractor(options: { failPrecheck?: boolean }) {
  const order: string[] = [];

  const input = z.object({ n: z.number() }).superRefine(() => {
    order.push("parse");
  });
  const output = z.object({ n: z.number() }).superRefine(() => {
    order.push("output");
  });

  class TestInteractor {
    invoke(data: { n: number }): Promise<Result> {
      order.push("body");
      return Promise.resolve({ ok: true, data: { n: data.n } });
    }

    precheck(_data: { n: number }, ctx: z.RefinementCtx) {
      order.push("precheck");
      if (options.failPrecheck) ctx.addIssue({ code: "custom", message: "precheck failed", path: ["n"] });
    }
  }

  const descriptor = Object.getOwnPropertyDescriptor(TestInteractor.prototype, "invoke") as PropertyDescriptor;
  Write({ input, output, precheck: (self: any, data, ctx) => self.precheck(data, ctx), tx: false })(
    TestInteractor.prototype,
    "invoke",
    descriptor,
  );
  Object.defineProperty(TestInteractor.prototype, "invoke", descriptor);

  return { interactor: new TestInteractor() as { invoke: (data: unknown) => Promise<Result> }, order };
}

describe("@Write", () => {
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
});
