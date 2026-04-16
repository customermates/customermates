import { describe, it, expect } from "vitest";
import { z, ZodError } from "zod";

import { ValidateOutput } from "../validate-output.decorator";

const TestSchema = z.object({
  id: z.string(),
  name: z.string(),
});

const NestedSchema = z.object({
  id: z.string(),
  profile: z.object({
    email: z.string(),
  }),
});

function makeInteractor(result: unknown) {
  class TestInteractor {
    @ValidateOutput(TestSchema)
    invoke() {
      return result;
    }
  }
  return new TestInteractor();
}

function makeArrayInteractor(result: unknown) {
  class TestInteractor {
    @ValidateOutput(TestSchema)
    invoke() {
      return result;
    }
  }
  return new TestInteractor();
}

function makeNestedInteractor(result: unknown) {
  class TestInteractor {
    @ValidateOutput(NestedSchema)
    invoke() {
      return result;
    }
  }
  return new TestInteractor();
}

describe("ValidateOutput", () => {
  it("strips unknown fields from a single object result", async () => {
    const interactor = makeInteractor({
      ok: true,
      data: { id: "1", name: "test", secretField: "leaked!" },
    });

    const result = await interactor.invoke();

    expect(result).toEqual({ ok: true, data: { id: "1", name: "test" } });
    expect((result as any).data).not.toHaveProperty("secretField");
  });

  it("strips unknown fields from an array result", async () => {
    const interactor = makeArrayInteractor({
      ok: true,
      data: [
        { id: "1", name: "first", extra: "nope" },
        { id: "2", name: "second", another: 42 },
      ],
    });

    const result = await interactor.invoke();

    expect(result).toEqual({
      ok: true,
      data: [
        { id: "1", name: "first" },
        { id: "2", name: "second" },
      ],
    });
    expect((result as any).data[0]).not.toHaveProperty("extra");
    expect((result as any).data[1]).not.toHaveProperty("another");
  });

  it("passes through { ok: false, error } results unchanged", async () => {
    const errorResult = { ok: false, error: { message: "something broke" } };
    const interactor = makeInteractor(errorResult);

    const result = await interactor.invoke();

    expect(result).toEqual(errorResult);
  });

  it("passes through null data unchanged", async () => {
    const interactor = makeInteractor({ ok: true, data: null });

    const result = await interactor.invoke();

    expect(result).toEqual({ ok: true, data: null });
  });

  it("passes through undefined data unchanged", async () => {
    const interactor = makeInteractor({ ok: true, data: undefined });

    const result = await interactor.invoke();

    expect(result).toEqual({ ok: true, data: undefined });
  });

  it("throws ZodError if required fields are missing in the output", async () => {
    const interactor = makeInteractor({
      ok: true,
      data: { id: "1" }, // missing required `name`
    });

    await expect(interactor.invoke()).rejects.toThrow(ZodError);
  });

  it("strips nested unknown fields", async () => {
    const interactor = makeNestedInteractor({
      ok: true,
      data: {
        id: "1",
        profile: { email: "a@b.com", secret: "hidden" },
        topLevelExtra: true,
      },
    });

    const result = await interactor.invoke();

    expect(result).toEqual({
      ok: true,
      data: { id: "1", profile: { email: "a@b.com" } },
    });
    expect((result as any).data).not.toHaveProperty("topLevelExtra");
    expect((result as any).data.profile).not.toHaveProperty("secret");
  });
});
