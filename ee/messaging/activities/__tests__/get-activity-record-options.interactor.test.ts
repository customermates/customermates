import { beforeEach, describe, expect, it, vi } from "vitest";

import { EntityType } from "@/generated/prisma";
import { runWithTenant } from "@/core/decorators/tenant-context";
import { createMockUser } from "@/tests/helpers/mock-user";
import { createMockDiModule, MOCK_ENV_MODULE, MOCK_ZOD_MODULE } from "@/tests/helpers/interactor-test-setup";

const mockUser = createMockUser();

vi.mock("@/env", () => MOCK_ENV_MODULE);
vi.mock("@/core/di", () => createMockDiModule(() => mockUser));
vi.mock("@/core/validation/zod-error-map-server", () => MOCK_ZOD_MODULE);

import {
  ActivityRecordOptionsRepo,
  GetActivityRecordOptionsInteractor,
} from "../get-activity-record-options.interactor";

const ids = Array.from({ length: 51 }, (_, index) => `00000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`);

class MockRepo extends ActivityRecordOptionsRepo {
  listRecordOptions = vi.fn(({ records }: { records: Array<{ entityType: EntityType; ids: string[] }> }) =>
    Promise.resolve(
      records.flatMap(({ entityType, ids: recordIds }) =>
        recordIds.map((id) => ({
          entityType,
          id,
          label: `Record ${id.slice(-2)}`,
        })),
      ),
    ),
  );
}

describe("GetActivityRecordOptionsInteractor", () => {
  beforeEach(() => vi.clearAllMocks());

  it("accepts fifty ids and invokes the repository once", async () => {
    const repo = new MockRepo();
    const input = {
      records: [{ entityType: EntityType.contact, ids: ids.slice(0, 50) }],
    };

    const result = await runWithTenant(mockUser, () => new GetActivityRecordOptionsInteractor(repo).invoke(input));

    expect(result.ok).toBe(true);
    expect(repo.listRecordOptions).toHaveBeenCalledOnce();
    expect(repo.listRecordOptions).toHaveBeenCalledWith(input);
    expect(result.ok && result.data).toHaveLength(50);
  });

  it.each([
    { records: [{ entityType: EntityType.contact, ids }] },
    { records: [{ entityType: EntityType.contact, ids: ["not-a-uuid"] }] },
  ])("rejects invalid input without invoking the repository", async (input) => {
    const repo = new MockRepo();

    const result = await runWithTenant(mockUser, () => new GetActivityRecordOptionsInteractor(repo).invoke(input));

    expect(result.ok).toBe(false);
    expect(repo.listRecordOptions).not.toHaveBeenCalled();
  });

  it("validates repository output before returning it", async () => {
    const repo = new MockRepo();
    repo.listRecordOptions.mockResolvedValueOnce([{ entityType: EntityType.contact, id: ids[0], label: 42 } as never]);

    await expect(
      runWithTenant(mockUser, () =>
        new GetActivityRecordOptionsInteractor(repo).invoke({
          records: [{ entityType: EntityType.contact, ids: [ids[0]] }],
        }),
      ),
    ).rejects.toThrow();
  });
});
