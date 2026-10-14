import { describe, expect, it, vi } from "vitest";

vi.mock("@/env", () => ({ env: { APP_MODE: "cloud" } }));
vi.mock("next-intl/server", () => ({
  getTranslations: () => Promise.resolve(Object.assign((key: string) => key, { raw: (key: string) => key })),
}));

import { runWithTenant } from "@/core/decorators/tenant-context";
import { unwindFailure } from "@/core/validation/failure-unwind";
import { CustomErrorCode } from "@/core/validation/validation.types";
import { createMockUser } from "@/tests/helpers/mock-user";
import { CountSystemTasksInteractor } from "../count-system-tasks.interactor";

describe("CountSystemTasksInteractor", () => {
  it("answers the count of open system tasks", async () => {
    const interactor = new CountSystemTasksInteractor({ getSystemTasksCount: () => Promise.resolve(3) });
    expect(await runWithTenant(createMockUser(), () => interactor.invoke())).toEqual({ ok: true, data: 3 });
  });

  it("answers an unwound service failure as a structured failure instead of throwing", async () => {
    const interactor = new CountSystemTasksInteractor({
      getSystemTasksCount: () => Promise.reject(unwindFailure(CustomErrorCode.recordConfigurationInvalid)),
    });
    expect(await runWithTenant(createMockUser(), () => interactor.invoke())).toMatchObject({
      ok: false,
      error: {
        issues: [expect.objectContaining({ params: expect.objectContaining({ error: "recordConfigurationInvalid" }) })],
      },
    });
  });
});
